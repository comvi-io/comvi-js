/**
 * Built as an IIFE that exposes `ComviInContextEditor` on `window`; the Chrome
 * extension loads it into pages at runtime.
 */

import { inContextEditorPlugin, type EditorOptions } from "./index";
import { ensureComviHook, readComviGlobalStatus } from "./comviHook";
import { Core } from "./Core";
import { getApiConfig, initApiConfig, resetApiConfig, type ApiTransport } from "./config/api";
import { apiFetch } from "./services/apiClient";
import { registerPostProcessorOnce } from "./postProcessor";
import { fetchApiTranslations, clearProjectInfoCache } from "@comvi/plugin-fetch-loader/api";
import type { TranslationValue } from "@comvi/core";
import type { EditorI18n } from "./Core";

let activeCore: Core | null = null;
let activeLifecycleCallback: ((detail: EditorLifecycleDetail) => void) | undefined;
// Aborts any in-flight translation refresh on teardown/replacement, and its
// signal is re-checked right before the refresh merges into the host i18n
// instance — the identity check on `activeCore` alone only protected the
// later render refresh, not this merge.
let activeRefreshController: AbortController | undefined;

// Stamped by the standalone build; the editor loader reports it as the
// loaded editor's version.
declare const __VERSION__: string;

/** The editor's own package version. */
export const version: string = __VERSION__;

const EDITOR_LOADER_KEY = Symbol.for("comvi.devtools.editorLoader");

/** What the editor records of the `devtools()` loader slot that is on the page. */
export interface EditorLoaderHookStatus {
  protocol: number;
  /** Absent when the slot's `sdkVersion` is not a string. */
  sdkVersion?: string;
}

// The slot is page-authored; a version string is far shorter than this.
const SDK_VERSION_MAX_LENGTH = 64;

let editorLoaderHook: EditorLoaderHookStatus | null = null;

/**
 * Reads the editor-loader slot (`contracts/chrome-extension-proxy.json`,
 * "editorLoader"). The slot is page-authored: there is none when an extension
 * that bundles the editor injected it, and a core newer than this editor
 * installs a higher protocol with fields this editor does not know. Every
 * protocol from 1 up is accepted and only protocol-1 fields are read.
 */
function readEditorLoaderHook(): EditorLoaderHookStatus | null {
  try {
    const slot = (globalThis as unknown as Record<symbol, unknown>)[EDITOR_LOADER_KEY] as
      { protocol?: unknown; sdkVersion?: unknown } | null | undefined;
    const protocol = slot?.protocol;
    if (typeof protocol !== "number" || !Number.isInteger(protocol) || protocol < 1) {
      return null;
    }
    const sdkVersion = slot?.sdkVersion;
    return typeof sdkVersion === "string"
      ? { protocol, sdkVersion: sdkVersion.slice(0, SDK_VERSION_MAX_LENGTH) }
      : { protocol };
  } catch {
    return null;
  }
}

/** Public, credential-free lifecycle event emitted by the standalone runtime. */
export const EDITOR_LIFECYCLE_EVENT = "comvi-in-context-editor:lifecycle";

export interface EditorLifecycleDetail {
  state: "activated" | "deactivated";
  instanceId: string;
}

function notifyLifecycle(detail: EditorLifecycleDetail, callback = activeLifecycleCallback): void {
  try {
    callback?.(detail);
  } catch (error) {
    console.warn("[@comvi/plugin-in-context-editor] Lifecycle callback failed.", error);
  }
  window.dispatchEvent(new CustomEvent<EditorLifecycleDetail>(EDITOR_LIFECYCLE_EVENT, { detail }));
}

export interface ActivateOptions extends EditorOptions {
  /**
   * API key for authentication (standalone mode). Ignored when `transport`
   * is provided — in that case authentication happens outside the page and
   * no key should ever be passed into the page context.
   */
  apiKey?: string;
  /**
   * Proxy transport for API requests (Chrome extension mode). All API calls
   * are delegated to this function; the extension service worker attaches
   * credentials and enforces the target host.
   */
  transport?: ApiTransport;
  /**
   * Non-secret API base URL used only for building request paths in
   * transport mode. The actual request target is decided by the transport.
   */
  apiBaseUrl?: string;
  /** Comvi instance ID to use (optional, uses first instance if not specified) */
  instanceId?: string;
  /**
   * Fetch fresh translations from the Comvi API before enabling click-to-edit.
   * Enabled by default for standalone/extension activation.
   */
  refreshMessages?: boolean;
  /**
   * Observe standalone lifecycle changes without receiving API configuration
   * or credentials. Consumers must treat MAIN-world events as untrusted; a
   * deactivation notification is suitable for fail-closed capability revoke.
   */
  onLifecycle?: (detail: EditorLifecycleDetail) => void;
}

export interface ActivateResult {
  stop: () => void;
  instanceId: string;
  /** Effective context collection after the site-level opt-out is applied. */
  collectContext: boolean;
}

/**
 * Adapt scoped apiFetch to the `typeof fetch` shape fetch-loader expects.
 * Only the path + query of the built URL is forwarded — in transport mode
 * the actual host is decided by the transport owner, never by page code.
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
      // Preserve caller cancellation (e.g. fetch-loader timeouts) so the
      // transport can abort the underlying proxied request.
      signal: init?.signal ?? undefined,
    });
  };
}

async function refreshMessagesFromApi(
  i18n: EditorI18n,
  apiKey: string | undefined,
  scopeId: string,
  signal: AbortSignal,
): Promise<void> {
  const config = getApiConfig(scopeId);
  if (!apiKey && !config.transport) {
    return;
  }

  const apiBaseUrl = config.baseUrl;

  const locales = i18n.getLoadedLocales();
  const namespaces = Array.from(
    new Set([i18n.getDefaultNamespace(), ...i18n.getActiveNamespaces()]),
  );

  if (locales.length === 0 || namespaces.length === 0) {
    return;
  }

  try {
    const updates: Record<string, Record<string, TranslationValue>> = {};
    await Promise.all(
      locales.map(async (locale) => {
        const store = await fetchApiTranslations(
          apiKey ?? "",
          locale,
          namespaces,
          apiBaseUrl,
          undefined,
          config.transport ? createScopedFetch(scopeId) : undefined,
          // In transport mode the apiKey is empty, so the default
          // baseUrl+apiKey cache key would collide across different
          // projects/transports. Scope cached project metadata to this
          // editor instance instead.
          config.transport ? scopeId : undefined,
          { signal },
        );
        for (const [key, translations] of store) {
          updates[key] = translations as Record<string, TranslationValue>;
        }
      }),
    );

    // The identity guard must sit immediately before the merge itself, not
    // only before the later render refresh: a replacement/teardown that
    // happens while this refresh is in flight must stop the stale catalog
    // from ever reaching addMessages, however non-empty it is.
    if (signal.aborted) {
      return;
    }

    if (Object.keys(updates).length > 0) {
      i18n.addMessages(updates);
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    console.warn(
      "[@comvi/plugin-in-context-editor] Failed to refresh messages from the API.",
      error,
    );
  }
}

function refreshRenderedTranslations(i18n: EditorI18n): void {
  // Re-add loaded translations after registering the post-processor so
  // framework bindings bump their cache revision and re-render marked text.
  const namespaces = new Set([i18n.getDefaultNamespace(), ...i18n.getActiveNamespaces()]);
  const updates: Record<string, Record<string, TranslationValue>> = {};

  for (const locale of i18n.getLoadedLocales()) {
    for (const namespace of namespaces) {
      if (!i18n.hasLocale(locale, namespace)) {
        continue;
      }

      const translations = i18n.getMessages(locale, namespace) as Record<string, TranslationValue>;
      if (Object.keys(translations).length > 0) {
        updates[`${locale}:${namespace}`] = translations;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    i18n.addMessages(updates);
  }
}

function isEditable(i18n: object): boolean {
  return typeof (i18n as { registerPostProcessor?: unknown }).registerPostProcessor === "function";
}

/**
 * Activate the in-context editor on the current page.
 *
 * @example
 * ```js
 * const editor = window.ComviInContextEditor.activate({
 *   apiKey: 'your-api-key',
 * });
 *
 * // Later, to deactivate:
 * editor.stop();
 * ```
 */
export function activate(options: ActivateOptions): ActivateResult | null {
  if (activeCore) {
    console.warn("[@comvi/plugin-in-context-editor] Already active. Call deactivate() first.");
    return null;
  }

  // Drain-and-swap the __COMVI__ discovery queue (protocol v2, dual-protocol
  // hook) and look the instance up in the hook.
  const comviHook = ensureComviHook();
  if (!comviHook || comviHook.instances.size === 0) {
    console.error(
      "[@comvi/plugin-in-context-editor] No Comvi i18n found. Ensure @comvi/core is loaded on the page.",
    );
    return null;
  }

  // Discovery also tracks base instances composed with devtools only; those
  // lack `registerPostProcessor`, so the default pick prefers an editable one.
  const i18n = options.instanceId
    ? comviHook.get(options.instanceId)
    : ([...comviHook.instances.values()].find(isEditable) ?? comviHook.get());
  if (!i18n) {
    console.error(
      "[@comvi/plugin-in-context-editor] No i18n instance found.",
      options.instanceId ? `Instance ID: ${options.instanceId}` : "No instances registered.",
    );
    return null;
  }
  if (!isEditable(i18n)) {
    console.error(
      "[@comvi/plugin-in-context-editor] This i18n instance cannot be edited: it was created without the plugin capability (`@comvi/core/plugins`).",
    );
    return null;
  }

  // Register post-processor for invisible characters (idempotent per i18n instance)
  registerPostProcessorOnce(i18n);

  // Context collection is ON by default. The site's i18n library option is the
  // single developer-level opt-out and always wins: if the page created its
  // instance with `collectContext: false`, honor it even when the editor is
  // enabled via the extension (which otherwise defaults collection on).
  // Otherwise fall back to any explicit caller value, else default on.
  const collectContext = i18n.collectContext === false ? false : (options.collectContext ?? true);

  activeCore = new Core(
    {
      targetElement: options.targetElement || document.body,
      tagAttributes: options.tagAttributes,
      debug: options.debug,
      highlightStyle: options.highlightStyle,
      collectContext,
      screenGroupResolver: options.screenGroupResolver,
    },
    i18n,
  );
  const instanceId = activeCore.getInstanceId();

  // Initialize API configuration. In transport mode the key never enters
  // the page context — authentication is attached by the transport owner.
  const apiKey = options.transport
    ? undefined
    : (options.apiKey ?? options.apiKeyOverride ?? i18n.apiKey)?.trim();
  try {
    initApiConfig(apiKey, instanceId, {
      transport: options.transport,
      baseUrl: options.apiBaseUrl,
    });
  } catch (error) {
    activeCore.stop();
    activeCore = null;
    throw error;
  }

  activeCore.start();
  activeLifecycleCallback = options.onLifecycle;
  notifyLifecycle({ state: "activated", instanceId });
  console.info(`[@comvi/plugin-in-context-editor] Activated (instance: ${instanceId})`);

  if (options.refreshMessages !== false) {
    const refreshController = new AbortController();
    activeRefreshController = refreshController;
    void refreshMessagesFromApi(i18n, apiKey, instanceId, refreshController.signal).finally(() => {
      if (activeCore === null || activeCore.getInstanceId() !== instanceId) {
        return;
      }
      refreshRenderedTranslations(i18n);
    });
  } else {
    // Only the API fetch is optional: text rendered before the processor was
    // registered still needs the re-render that marks it.
    refreshRenderedTranslations(i18n);
  }

  return {
    stop: () => deactivateInstance(instanceId),
    instanceId,
    collectContext,
  };
}

function deactivateInstance(expectedInstanceId?: string): void {
  if (!activeCore) {
    if (expectedInstanceId === undefined) {
      console.warn("[@comvi/plugin-in-context-editor] Not active.");
    }
    return;
  }

  const instanceId = activeCore.getInstanceId();
  if (expectedInstanceId !== undefined && instanceId !== expectedInstanceId) {
    return;
  }

  const core = activeCore;
  const lifecycleCallback = activeLifecycleCallback;
  activeCore = null;
  activeLifecycleCallback = undefined;
  activeRefreshController?.abort();
  activeRefreshController = undefined;
  let cleanupError: unknown;
  try {
    core.stop();
  } catch (error) {
    cleanupError = error;
  }
  try {
    resetApiConfig(instanceId);
  } catch (error) {
    cleanupError ??= error;
  }
  clearProjectInfoCache(instanceId);
  notifyLifecycle({ state: "deactivated", instanceId }, lifecycleCallback);

  console.info("[@comvi/plugin-in-context-editor] Deactivated");
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
}

export function deactivate(): void {
  deactivateInstance();
}

export function isActive(): boolean {
  return activeCore !== null;
}

export function getStatus(): {
  active: boolean;
  instanceId: string | null;
  comviDetected: boolean;
  comviVersion: string | null;
  instanceCount: number;
  /** The `devtools()` editor-loader slot read at boot; `null` when the page had none. */
  hook: EditorLoaderHookStatus | null;
} {
  return {
    active: activeCore !== null,
    instanceId: activeCore?.getInstanceId() ?? null,
    ...readComviGlobalStatus(),
    hook: editorLoaderHook && { ...editorLoaderHook },
  };
}

export { inContextEditorPlugin };

// Expose on window for CDN usage
declare global {
  interface Window {
    ComviInContextEditor?: {
      activate: typeof activate;
      deactivate: typeof deactivate;
      isActive: typeof isActive;
      getStatus: typeof getStatus;
      inContextEditorPlugin: typeof inContextEditorPlugin;
      version: string;
    };
  }
}

// Boot-time drain-and-swap: replace a raw __COMVI__ queue (or a legacy v1
// registry) with the dual-protocol hook BEFORE any instance lookup, so
// entries pushed between now and activate() are never lost.
if (typeof window !== "undefined") {
  ensureComviHook();
  editorLoaderHook = readEditorLoaderHook();
  window.ComviInContextEditor = {
    activate,
    deactivate,
    isActive,
    getStatus,
    inContextEditorPlugin,
    version,
  };
}
