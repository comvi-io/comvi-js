/**
 * @comvi/core/devtools — the browser-extension hook (COM-140 behaviour, design §2.7):
 * discovery on `window.__COMVI__` and the page-level editor loader the Comvi browser
 * extension calls to load the in-context editor from jsDelivr. Opt-in and working in
 * production builds; nothing is requested until the extension asks.
 *
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { devtools } from "@comvi/core/devtools";
 *
 * const i18n = createI18n({ locale: "en", plugins: [devtools({ instanceId: "app" })] });
 * ```
 *
 * `devtools()` is a plugin: `setup` exposes the instance (protocol v2 queue, mixed-version
 * safe) and installs the editor loader; `destroy()` removes the entry again. The entry is
 * `{ v, i }`: the core version and the instance; the instance carries its id (`comvi-<n>`
 * unless given) as a NON-enumerable `instanceId`, which protocol-v2 consumers key on.
 */
import type { I18n, Plugin } from "./instance";

declare const __VERSION__: string;
declare const __DEV__: boolean;

/** The core version, inlined at build time (checked by `pnpm check:inlined-version`). */
export const VERSION: string = __VERSION__;

/** Entry pushed onto the `window.__COMVI__` queue (protocol v2). */
export interface ComviQueueEntry {
  /** Core library version that produced the entry. */
  v: string;
  /** The exposed instance, with its id as the non-enumerable `instanceId`. */
  i: I18n & { readonly instanceId?: string };
}

/** Hook object a consumer (the in-context editor) may swap in place of the queue array. */
export interface ComviHook {
  push(entry: ComviQueueEntry): void;
  remove(entry: ComviQueueEntry): void;
}

/** The discovery queue: the raw entry array or a consumer-swapped hook. */
export type ComviQueue = ComviQueueEntry[] | ComviHook;

/** Why an editor load failed (`contracts/chrome-extension-proxy.json`, `editorLoader.failureCodes`). */
export type EditorLoadFailureCode =
  "csp-blocked" | "load-error" | "timeout" | "no-global" | "invalid-editor-version";

/** What `EditorLoaderSlot.load()` resolves with; it never rejects. */
export interface EditorLoadResult {
  ok: boolean;
  /** The URL requested (with the hourly cache salt on `latest`). */
  url: string;
  /** The `@comvi/core` version that installed the slot. */
  sdkVersion: string;
  /** The hook↔editor protocol version of the slot that ran the load. */
  protocol: number;
  /** The editor's own reported version when `ok`. */
  editorVersion: string | undefined;
  /** The failure code when `ok` is false. */
  code: EditorLoadFailureCode | undefined;
  /** When `ok` is false, the host a Content Security Policy has to allow. */
  host: string | undefined;
  /** Optional, human-readable. Reserved: core never sets it. */
  message?: string;
}

/** The page-level editor loader on `globalThis[Symbol.for("comvi.devtools.editorLoader")]` (protocol 1). */
export interface EditorLoaderSlot {
  protocol: number;
  sdkVersion: string;
  /** The exact-version pin, `"latest"`, or `"invalid"` (then `url` is `""`). */
  editorVersion: string;
  url: string;
  /** Loads the editor once per page; a failed load may be retried. */
  load(): Promise<EditorLoadResult>;
}

export interface DevtoolsOptions {
  /** Stable id for this instance. Auto-generated (`comvi-<n>`) when omitted. */
  instanceId?: string;
  /** Expose on `window.__COMVI__`. Defaults to `true` in a browser, `false` under SSR. */
  exposeGlobal?: boolean;
  /**
   * Exact version of `@comvi/plugin-in-context-editor` the editor loader requests
   * (major.minor.patch, optionally a prerelease). Defaults to `"latest"`. Anything else
   * FAILS CLOSED: nothing is requested and the loader reports `invalid-editor-version`.
   * The first instance on a page decides.
   */
  editorVersion?: string;
}

declare global {
  interface Window {
    __COMVI__?: ComviQueue;
  }
}

/** v1 legacy registry (register WITHOUT remove): an old core on the same page. */
interface LegacyComviRegistry {
  register(id: string, instance: unknown): void;
  unregister?(id: string): void;
}

// The default-id sequence lives in a slot every copy of core on the page shares, so a
// CDN copy and a bundled copy never both mint `comvi-1`.
const COUNTER_KEY = Symbol.for("comvi.core.instanceCounter");
let fallbackCounter = 0;

/** The next `comvi-<n>`, counted once per page rather than once per copy. */
const mintInstanceId = (): string => {
  try {
    const slot = globalThis as unknown as Record<symbol, unknown>;
    const previous = slot[COUNTER_KEY];
    // Anything a page put in the slot that is not a non-negative number restarts the count.
    return `comvi-${(slot[COUNTER_KEY] = (typeof previous === "number" && previous >= 0 ? previous : 0) + 1)}`;
  } catch {
    // An unwritable slot must not break setup; a per-copy count stands in.
    return `comvi-${++fallbackCounter}`;
  }
};

// The editor loader (protocol 1 — `contracts/chrome-extension-proxy.json`,
// `editorLoader`). The Comvi browser extension carries no editor: it calls the
// slot below and THIS code, shipped by the site, loads the standalone editor
// into the page. Host and path are constants; the only variable part of the URL
// is the version, taken from the app's own `devtools({ editorVersion })` and
// accepted only when it is an exact version.
const EDITOR_CDN_HOST = "cdn.jsdelivr.net";
const EDITOR_CDN_ORIGIN = "https://" + EDITOR_CDN_HOST;
const EDITOR_LOADER_PROTOCOL = 1;

// SemVer 2.0 without build metadata: no leading zeros in numbers, and a
// prerelease made of non-empty dot-separated identifiers (`1.2.3-rc.1`), so a
// pin npm could never have published fails closed instead of reaching the CDN.
const EDITOR_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
// Page-wide, like `COUNTER_KEY`: every copy of core on the page meets the same
// slot. The load promise has a key of its own so that a core replacing an
// older slot inherits a pending or finished load instead of starting a second.
const LOADER_KEY = Symbol.for("comvi.devtools.editorLoader");
const LOAD_KEY = Symbol.for("comvi.devtools.editorLoad");

/**
 * A load result. One literal for both outcomes: `code` and `host` are
 * `undefined` on success, `editorVersion` on failure.
 */
const loadResult = (
  url: string,
  code?: EditorLoadFailureCode,
  editorVersion?: string,
): EditorLoadResult => ({
  ok: !code,
  url,
  sdkVersion: VERSION,
  protocol: EDITOR_LOADER_PROTOCOL,
  editorVersion,
  code,
  host: code && EDITOR_CDN_HOST,
});

/**
 * The success result when the editor global is on the page, otherwise
 * `undefined`. `activate` and `version` are the ONLY members ever read off
 * `window.ComviInContextEditor` — an editor of any version must satisfy this.
 */
function loadedEditor(url: string): EditorLoadResult | undefined {
  try {
    const editor = (window as unknown as { ComviInContextEditor: Record<string, unknown> })
      .ComviInContextEditor;
    if (typeof editor.activate === "function") {
      const version = editor.version;
      return loadResult(url, undefined, typeof version === "string" ? version : undefined);
    }
  } catch {
    // No global, or one that throws when read: a missing editor either way.
  }
}

/**
 * Install the page-level editor loader unless a slot of the same or a newer
 * protocol is already there. Touches no DOM: the `<script>` is created by
 * `load()`, which only the extension calls.
 *
 * Takes the options object, not the pin: `editorVersion` is read HERE, once,
 * inside the guard, so a throwing getter costs the slot and nothing else, and
 * the value that was validated is the value that reaches the URL.
 */
function installEditorLoader(options: DevtoolsOptions): void {
  try {
    const pin: unknown = options.editorVersion;
    let editorVersion = "latest";
    if (pin !== undefined && pin !== editorVersion) {
      // A string and nothing else: an object is coerced anew on every use, so
      // one that passes the pattern could still print something else into the URL.
      if (typeof pin === "string" && EDITOR_VERSION.test(pin)) {
        editorVersion = pin;
      } else {
        // FAILS CLOSED: an explicit pin that is not an exact version never
        // becomes `latest`. The slot is still installed, so the extension can
        // name the mistake, but its load() requests nothing.
        editorVersion = "invalid";
        if (__DEV__) {
          console.warn(
            `[@comvi/core] devtools({ editorVersion }) got ` +
              `${typeof pin === "string" ? JSON.stringify(pin) : `a value of type ${typeof pin}`}, ` +
              `which is not an exact version (major.minor.patch, such as 1.2.3); the editor loader will not load the editor.`,
          );
        }
      }
    }

    const slots = globalThis as unknown as Record<symbol, unknown>;
    const existing = slots[LOADER_KEY] as EditorLoaderSlot | undefined;
    // Anything a page may have planted here that is not a slot of at least
    // this protocol is replaced (NaN and non-numbers fail the comparison).
    //
    // ACCEPTED LIMITS. Both keys are the page's own globals, and a page that
    // rewrites them only breaks its own editor: a foreign slot of a newer
    // protocol is deferred to as it is, a promise planted under the load key is
    // returned as it is (no timeout is wrapped around it — the extension's own
    // activation timeout bounds it), and a page that deletes the load key
    // between two calls gets a second `<script>`.
    if (existing && existing.protocol >= EDITOR_LOADER_PROTOCOL) {
      if (__DEV__ && pin !== undefined && existing.editorVersion !== editorVersion) {
        console.warn(
          `[@comvi/core] editorVersion ignored: another instance already installed the editor ` +
            `loader with ${JSON.stringify(existing.editorVersion)}.`,
        );
      }
      return;
    }

    const url =
      editorVersion === "invalid"
        ? ""
        : `${EDITOR_CDN_ORIGIN}/npm/@comvi/plugin-in-context-editor@${editorVersion}/dist/standalone.iife.js`;
    const slot: EditorLoaderSlot = {
      protocol: EDITOR_LOADER_PROTOCOL,
      sdkVersion: VERSION,
      editorVersion,
      url,
      load() {
        // An invalid pin: no URL, nothing is ever requested.
        if (!url) return Promise.resolve(loadResult(url, "invalid-editor-version"));
        // A pending load, or one that succeeded: the same promise every time.
        const pending = slots[LOAD_KEY] as Promise<EditorLoadResult> | undefined;
        if (pending) return pending;
        // An old extension injected its bundled copy, or the site bundled the
        // standalone itself: nothing to request.
        const loaded = loadedEditor(url);
        if (loaded) return Promise.resolve(loaded);

        // `latest` is cached by the browser for 7 days; the hour bucket bounds
        // that to an hour. An exact version is immutable and takes no query.
        const src =
          editorVersion === "latest" ? `${url}?comvi=${Math.floor(Date.now() / 3_600_000)}` : url;
        let resolve!: (result: EditorLoadResult) => void;
        const promise = new Promise<EditorLoadResult>((r) => (resolve = r));
        let script: HTMLScriptElement | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let blocked: boolean | undefined;
        let refused: boolean | undefined;
        const onViolation = (event: SecurityPolicyViolationEvent): void => {
          const uri = String(event.blockedURI);
          // A script policy that names this script and is not report-only (an
          // engine that omits `disposition` is taken to enforce): Chrome reports
          // the full URL, query included; other engines truncate it to the
          // origin. A report-only policy, or another directive, blocks nothing here.
          if (
            event.disposition !== "report" &&
            /^script-src(-elem)?$/.test(event.effectiveDirective) &&
            (uri.startsWith(url) || uri === EDITOR_CDN_ORIGIN)
          ) {
            blocked = true;
          }
        };
        const settle = (code?: EditorLoadFailureCode): void => {
          const result = (!code && loadedEditor(src)) || loadResult(src, code || "no-global");
          // FIRST, so that nothing below can strand the caller.
          resolve(result);
          clearTimeout(timer);
          try {
            if (script) {
              document.removeEventListener("securitypolicyviolation", onViolation);
              // For every outcome: a script that stays in the document must not
              // keep this attempt's closures alive, and a removed one may still fire.
              script.onload = script.onerror = null;
              if (!result.ok) script.remove();
            }
            // A failure is never cached: the next load() starts fresh, for
            // instance after the site's CSP was fixed. Only this attempt's own
            // promise is cleared, and last, because the key may not be writable.
            if (!result.ok && slots[LOAD_KEY] === promise) slots[LOAD_KEY] = undefined;
          } catch {
            /* cleanup must never throw into an event handler */
          }
        };
        try {
          // Stored BEFORE any DOM work, so a load that settles synchronously
          // still clears it.
          slots[LOAD_KEY] = promise;
          script = document.createElement("script");
          document.addEventListener("securitypolicyviolation", onViolation);
          script.onload = () => settle();
          // The violation event is dispatched before the element's error.
          script.onerror = () => settle(blocked ? "csp-blocked" : "load-error");
          timer = setTimeout(settle, 10_000, "timeout"); // the load timeout
          script.crossOrigin = "anonymous";
          refused = true;
          script.src = src;
          refused = false;
          document.documentElement.appendChild(script);
        } catch {
          // Only the `src` assignment throwing means policy: that is how Trusted
          // Types rejects it. Anything else — no document, no root element to
          // insert into — is a plain failure to load.
          settle(refused ? "csp-blocked" : "load-error");
        }
        return promise;
      },
    };
    slots[LOADER_KEY] = slot;
  } catch {
    /* the editor loader must never break construction */
  }
}

/**
 * The devtools plugin: exposes the instance on `window.__COMVI__` and installs the
 * editor loader (in a browser, unless `exposeGlobal: false`); `destroy()` removes the
 * entry. Probe order on the page's global: array → v2 hook (push AND remove) → legacy
 * registry (register without remove) → a fresh queue. A truthy global of any other shape
 * is left alone.
 */
export const devtools = (options: DevtoolsOptions = {}): Plugin => ({
  name: "devtools",
  setup(i18n) {
    const w = typeof window != "undefined";
    // Exposed by default in a browser; without a window (SSR) only `exposeGlobal: true`
    // gives the id (editor-bridge / SSR mappings key on it), never the queue. A second
    // devtools() on the same instance neither re-exposes nor re-ids it (0.7).
    if (!(options.exposeGlobal ?? w) || "instanceId" in i18n) return;
    const id = options.instanceId || mintInstanceId();
    // Extensions of protocol v2 key instances on `entry.i.instanceId`: kept, NON-enumerable,
    // so the instance's own members stay the 13 of the core contract.
    const entry: ComviQueueEntry = {
      v: VERSION,
      i: Object.defineProperty(i18n, "instanceId", { value: id }),
    };
    if (!w) return;
    try {
      const g = window.__COMVI__ as unknown;
      if (Array.isArray(g)) g.push(entry);
      else if (
        g &&
        typeof (g as ComviHook).push === "function" &&
        typeof (g as ComviHook).remove === "function"
      )
        (g as ComviHook).push(entry);
      else if (g && typeof (g as LegacyComviRegistry).register === "function")
        (g as LegacyComviRegistry).register(id, i18n);
      else if (!g) window.__COMVI__ = [entry];
    } catch {
      /* discovery must never break setup */
    }
    installEditorLoader(options);
    return () => {
      try {
        const g = window.__COMVI__ as unknown;
        if (Array.isArray(g)) {
          // A masquerading hook's OWN remove shadows Array.prototype; a page's
          // Array.prototype.remove polyfill (the same function on every array) never sees
          // our entry object.
          if ((g as unknown as ComviHook).remove !== ([] as unknown as ComviHook).remove)
            (g as unknown as ComviHook).remove(entry);
          // indexOf -1 >>> 0 is 2^32-1: a splice past the end removes nothing.
          else g.splice(g.indexOf(entry) >>> 0, 1);
        } else if (g && typeof (g as ComviHook).remove === "function")
          (g as ComviHook).remove(entry);
        else if (g && typeof (g as LegacyComviRegistry).unregister === "function")
          (g as LegacyComviRegistry).unregister!(id);
      } catch {
        /* removal must never break destroy */
      }
    };
  },
});
