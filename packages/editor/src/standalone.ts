/**
 * Built as an IIFE (`dist/standalone.iife.js`) that exposes `ComviInContextEditor` on
 * `window`. The Comvi browser extension puts it on a page through the instance's handle
 * (`x.load(version)`, protocol 2) and calls `activate()`.
 */

import { Core } from "./Core";
import { Session, discover, isLoaded, type ActivateFailureCode } from "./adapter";
import { getApiConfig, initApiConfig, resetApiConfig, type ApiTransport } from "./config/api";
import { apiFetch } from "./services/apiClient";
import { fetchApiTranslations, clearProjectInfoCache } from "./api-fetch";
import type { TranslationSystemOptions } from "./types";

export type { ActivateFailureCode };

let active: { core: Core; session: Session; refresh?: AbortController } | null = null;
let activeLifecycleCallback: ((detail: EditorLifecycleDetail) => void) | undefined;

// Stamped by the standalone build.
declare const __VERSION__: string;

/** The editor's own package version. */
export const version: string = __VERSION__;

/** Public, credential-free lifecycle event emitted by the standalone runtime. */
export const EDITOR_LIFECYCLE_EVENT = "comvi-in-context-editor:lifecycle";

export interface EditorLifecycleDetail {
  state: "activated" | "deactivated";
}

function notifyLifecycle(detail: EditorLifecycleDetail, callback = activeLifecycleCallback): void {
  try {
    callback?.(detail);
  } catch (error) {
    console.warn("[@comvi/editor] Lifecycle callback failed.", error);
  }
  window.dispatchEvent(new CustomEvent<EditorLifecycleDetail>(EDITOR_LIFECYCLE_EVENT, { detail }));
}

export interface ActivateOptions extends Omit<TranslationSystemOptions, "targetElement"> {
  /** The DOM subtree to watch. Defaults to `document.body`. */
  targetElement?: Node;
  /**
   * API key. Ignored when `transport` is provided — then authentication happens outside the
   * page and no key should ever be passed into the page context.
   */
  apiKey?: string;
  /**
   * Proxy transport for API requests (the extension). Every API call goes through it; the
   * extension's service worker attaches credentials and enforces the target host.
   */
  transport?: ApiTransport;
  /** Non-secret API base URL, used only to build request paths in transport mode. */
  apiBaseUrl?: string;
  /** Fetch the latest translations of the loaded pairs from the API first. Default `true`. */
  refreshMessages?: boolean;
  /**
   * Observe lifecycle changes without receiving API configuration or credentials. MAIN-world
   * events are untrusted; a deactivation notice suits a fail-closed capability revoke.
   */
  onLifecycle?: (detail: EditorLifecycleDetail) => void;
}

/** What `activate()` returns: a session, or why there is none (nothing was done then). */
export type ActivateResult =
  | {
      ok: true;
      stop: () => void;
      /** Context collection: off in 0.8 (no requests to the context routes). */
      collectContext: false;
    }
  | { ok: false; code: ActivateFailureCode; message: string };

const MESSAGES: Record<ActivateFailureCode, string> = {
  "no-window": "Not in a browser.",
  "already-active": "Already active. Call deactivate() first.",
  "no-instance":
    "No Comvi i18n on this page. Compose `plugins: [devtools()]` (@comvi/core/devtools 0.8) on the instance.",
  "old-protocol":
    "This page runs an older Comvi i18n (before 0.8). Upgrade to @comvi/core 0.8 with `plugins: [devtools()]`.",
  "unknown-protocol":
    "This page speaks a newer editor protocol than this editor. Update the Comvi browser extension.",
};

const fail = (code: ActivateFailureCode): ActivateResult => ({
  ok: false,
  code,
  message: `[@comvi/editor] ${MESSAGES[code]}`,
});

/**
 * Adapt scoped apiFetch to the `typeof fetch` shape the API fetcher expects. Only the path +
 * query of the built URL is forwarded — in transport mode the host is the transport's.
 */
function createScopedFetch(scopeId: string): typeof fetch {
  return async (input, init) => {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(target);
    return apiFetch(scopeId, url.pathname + url.search, {
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
      keepalive: init?.keepalive,
      signal: init?.signal ?? undefined,
    });
  };
}

/**
 * Fetches the latest messages of every pair the instances loaded and writes them back —
 * loaded pairs only (`isLoaded`), so a pair that failed, loads or never loaded keeps its own
 * load. Locales: those with a loaded catalog; namespaces: `state().ns` and `default`.
 */
async function refreshMessagesFromApi(
  session: Session,
  apiKey: string | undefined,
  scopeId: string,
  signal: AbortSignal,
): Promise<void> {
  const config = getApiConfig(scopeId);
  if (!apiKey && !config.transport) return;

  const pairs = new Map<string, Set<string>>();
  for (const t of session.list()) {
    try {
      const s = t.x.state();
      for (const ns of new Set(["default", ...s.ns])) {
        for (const locale of Object.keys(s.c[ns] ?? {})) {
          if (isLoaded(s, ns, locale)) {
            if (!pairs.has(locale)) pairs.set(locale, new Set());
            pairs.get(locale)!.add(ns);
          }
        }
      }
    } catch {
      /* the page's handle */
    }
  }
  if (pairs.size === 0) return;

  try {
    const updates: [locale: string, ns: string, messages: Record<string, string>][] = [];
    await Promise.all(
      [...pairs].map(async ([locale, namespaces]) => {
        const store = await fetchApiTranslations(
          apiKey ?? "",
          locale,
          [...namespaces],
          config.baseUrl,
          undefined,
          config.transport ? createScopedFetch(scopeId) : undefined,
          // In transport mode the key is empty, so project metadata is cached per editor.
          config.transport ? scopeId : undefined,
          { signal },
        );
        for (const [cacheKey, messages] of store) {
          const ns = cacheKey.slice(cacheKey.indexOf(":") + 1);
          updates.push([locale, ns, messages as Record<string, string>]);
        }
      }),
    );
    // Checked right before the write: a teardown during the fetch writes nothing.
    if (signal.aborted) return;
    for (const t of session.list()) {
      let s;
      try {
        s = t.x.state();
      } catch {
        continue;
      }
      for (const [locale, ns, messages] of updates) {
        if (isLoaded(s, ns, locale) && Object.keys(messages).length > 0)
          t.i.add(locale, messages, ns);
      }
    }
  } catch (error) {
    if (signal.aborted) return;
    console.warn("[@comvi/editor] Failed to refresh messages from the API.", error);
  }
}

/**
 * Activates the editor on the page's Comvi instances (every compatible `window.__COMVI__`
 * entry). On an incompatible or empty page it returns `{ ok: false, code }` BEFORE creating
 * anything: nothing is called on any entry and nothing is added to the page.
 */
export function activate(options: ActivateOptions = {}): ActivateResult {
  if (typeof window === "undefined" || typeof document === "undefined") return fail("no-window");
  if (active) return fail("already-active");

  const found = discover();
  if (!found.ok) return fail(found.code);

  const apiKey = options.transport ? undefined : options.apiKey?.trim();
  const session = new Session(found.q, found.found);
  const core = new Core(
    {
      targetElement: options.targetElement || document.body,
      tagAttributes: options.tagAttributes,
      debug: options.debug,
      highlightStyle: options.highlightStyle,
    },
    session,
  );
  const scopeId = core.getInstanceId();
  try {
    initApiConfig(apiKey, scopeId, { transport: options.transport, baseUrl: options.apiBaseUrl });
  } catch (error) {
    core.stop();
    session.stop();
    throw error;
  }

  core.start();
  active = { core, session };
  activeLifecycleCallback = options.onLifecycle;
  notifyLifecycle({ state: "activated" });
  console.info("[@comvi/editor] Activated");

  if (options.refreshMessages !== false) {
    const refresh = new AbortController();
    active.refresh = refresh;
    void refreshMessagesFromApi(session, apiKey, scopeId, refresh.signal);
  }

  const mine = active;
  return { ok: true, stop: () => deactivateSession(mine), collectContext: false };
}

function deactivateSession(expected?: typeof active): void {
  if (!active) {
    if (expected === undefined) console.warn("[@comvi/editor] Not active.");
    return;
  }
  if (expected !== undefined && expected !== active) return;

  const { core, session, refresh } = active;
  const lifecycleCallback = activeLifecycleCallback;
  active = null;
  activeLifecycleCallback = undefined;
  refresh?.abort();
  const scopeId = core.getInstanceId();
  let cleanupError: unknown;
  try {
    core.stop();
  } catch (error) {
    cleanupError = error;
  }
  try {
    session.stop();
  } catch (error) {
    cleanupError ??= error;
  }
  try {
    resetApiConfig(scopeId);
  } catch (error) {
    cleanupError ??= error;
  }
  clearProjectInfoCache(scopeId);
  notifyLifecycle({ state: "deactivated" }, lifecycleCallback);

  console.info("[@comvi/editor] Deactivated");
  if (cleanupError !== undefined) throw cleanupError;
}

export function deactivate(): void {
  deactivateSession();
}

export function isActive(): boolean {
  return active !== null;
}

if (typeof window !== "undefined") {
  window.ComviInContextEditor = { activate, deactivate, isActive, version };
}
