// Browser-extension discovery capability — the implementation half of
// `@comvi/core/devtools`.
//
// Everything that makes an instance findable by a devtools extension lives
// here and NOWHERE else: the `window.__COMVI__` protocol probe, the version
// stamp, the instance-id counter, and the identity-based removal on destroy.
// A base `@comvi/core` instance therefore never carries the protocol —
// it is absent from the module graph, not disabled by a flag.
//
// ONE implementation, TWO install surfaces, exactly like `core/loader.ts`:
// `core/full.ts` installs the prototype descriptors and calls `_initDevtools`
// from its constructor; `attachDevtools(i18n)` copies the same descriptors onto
// a base instance and then exposes it. The descriptor copy (never a plain
// `i._x = fn` assignment) is what keeps the hooks NON-ENUMERABLE, which the
// reflective contract asserts: `{ ...i18n }` must carry data only, never
// behaviour.
//
// MANGLING CONTRACT: `_globalEntry`, `_initDevtools` and `_disposeDevtools` are
// renamed by the single shared terser nameCache in
// `vite.shared.ts#mangleInternalProps`. Dot access only — never a string key.
import type {
  ComviHook,
  ComviQueueEntry,
  DefaultTranslationParams,
  EditorLoadFailureCode,
  EditorLoadResult,
  EditorLoaderSlot,
} from "../types";
import { I18n as I18nBase, type I18nInternal } from "./i18n";

declare const __VERSION__: string | undefined;
declare const __DEV__: boolean | undefined;

const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.1.0";
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

// The default-id sequence, in a slot every copy of core on the page shares —
// the same cross-copy channel `duplicateGuard.ts` claims for the version. A
// module-scoped counter belongs to ONE copy, so a CDN global plus a bundled npm
// copy (or a binding pinned to another patch) would both mint `comvi-1`, and a
// consumer keyed on the id — both shipped ones are — would only ever see one of
// the two. Nothing about minting reads the page's `__COMVI__`: an id is chosen
// before the protocol is probed, and a hostile hook must not be able to throw
// out of, or spin, construction.
const COUNTER_KEY = Symbol.for("comvi.core.instanceCounter");

let fallbackCounter = 0;

/**
 * v1 legacy registry shape (`register` WITHOUT `remove`) — mixed-version
 * interop only: an old core on the same page may have installed it.
 */
interface LegacyComviRegistry {
  register(id: string, instance: I18nBase): void;
  unregister?(id: string): void;
}

/** The next `comvi-<n>`, counted once per page rather than once per copy. */
function mintInstanceId(): string {
  let n = ++fallbackCounter;
  try {
    const slot = globalThis as unknown as Record<symbol, unknown>;
    const previous = slot[COUNTER_KEY];
    // A page may have put anything in the slot; only a non-negative number
    // continues the sequence (NaN fails the comparison and restarts it).
    const next = (typeof previous === "number" && previous >= 0 ? previous : 0) + 1;
    slot[COUNTER_KEY] = next;
    n = next;
  } catch {
    // An unwritable or throwing slot must not break construction; the
    // per-copy count stands in.
  }
  return `comvi-${n}`;
}

// The editor loader (protocol 1 — `contracts/chrome-extension-proxy.json`,
// `editorLoader`). The Comvi browser extension carries no editor: it calls the
// slot below and THIS code, shipped by the site, loads the standalone editor
// into the page. Host and path are constants; the only variable part of the URL
// is the version, taken from the app's own `devtools({ editorVersion })` and
// accepted only when it is an exact version.
const EDITOR_CDN_HOST = "cdn.jsdelivr.net";
const EDITOR_CDN_ORIGIN = "https://" + EDITOR_CDN_HOST;
const EDITOR_LOADER_PROTOCOL = 1;
const LOAD_TIMEOUT_MS = 10_000;
const EDITOR_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
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
function installEditorLoader(options?: DevtoolsOptions): void {
  try {
    const pin: unknown = options && options.editorVersion;
    let editorVersion = "latest";
    if (pin !== undefined && pin !== editorVersion) {
      // A string and nothing else: an object is coerced anew on every use, so
      // one that passes the pattern could still print something else into the URL.
      if (typeof pin === "string" && EDITOR_VERSION.test(pin)) {
        editorVersion = pin;
      } else if (IS_DEV) {
        console.warn(
          `[@comvi/core] devtools({ editorVersion }) got ` +
            `${typeof pin === "string" ? JSON.stringify(pin) : `a value of type ${typeof pin}`}, ` +
            `which is not an exact version (major.minor.patch); the editor loader falls back to latest.`,
        );
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
      if (IS_DEV && pin !== undefined && existing.editorVersion !== editorVersion) {
        console.warn(
          `[@comvi/core] editorVersion ignored: another instance already installed the editor ` +
            `loader with ${JSON.stringify(existing.editorVersion)}.`,
        );
      }
      return;
    }

    const url = `${EDITOR_CDN_ORIGIN}/npm/@comvi/plugin-in-context-editor@${editorVersion}/dist/standalone.iife.js`;
    const slot: EditorLoaderSlot = {
      protocol: EDITOR_LOADER_PROTOCOL,
      sdkVersion: VERSION,
      editorVersion,
      url,
      load() {
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
          timer = setTimeout(settle, LOAD_TIMEOUT_MS, "timeout");
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

/** Discovery options; the composite reads the first two off `I18nOptions`. */
export interface DevtoolsOptions {
  /** Stable id for this instance. Auto-generated (`comvi-<n>`) when omitted. */
  instanceId?: string;
  /** Expose on `window.__COMVI__`. Defaults to `true` in a browser, `false` under SSR. */
  exposeGlobal?: boolean;
  /**
   * Exact version of `@comvi/plugin-in-context-editor` the editor loader
   * requests, for example `"0.6.0"`. Defaults to `"latest"`; anything that is
   * not an exact version falls back to it. The first instance on a page
   * decides. The CDN global (the UMD composite) cannot pin.
   */
  editorVersion?: string;
}

/**
 * The discovery capability. Not exported from any entry point: the composite
 * installs its prototype descriptors in `core/full.ts`, a base instance gets
 * them from `attachDevtools`.
 */
export class I18nWithDevtools<D extends DefaultTranslationParams = {}> extends I18nBase<D> {
  /** Entry pushed onto `window.__COMVI__` — kept for identity-based removal. */
  declare protected _globalEntry?: ComviQueueEntry;

  /**
   * Assign the instance id and expose on the discovery queue. Called by the
   * composite's constructor and by `attachDevtools`; this class declares no
   * constructor of its own.
   */
  protected _initDevtools(
    instanceId?: string,
    exposeGlobal?: boolean,
    options?: DevtoolsOptions,
  ): void {
    if (!(exposeGlobal ?? typeof window !== "undefined")) return;

    const self = this as unknown as I18nInternal;
    self.instanceId = instanceId || mintInstanceId();
    if (typeof window === "undefined") return;

    // Mixed-version-safe discovery (protocol v2). Pages may run two core
    // versions: probe order is array → hook (push AND remove) → legacy
    // registry (register WITHOUT remove) → install fresh queue. A truthy
    // non-conforming global is left untouched (never clobber).
    const entry: ComviQueueEntry = { v: VERSION, i: this as unknown as ComviQueueEntry["i"] };
    this._globalEntry = entry;
    try {
      const g = window.__COMVI__ as unknown;
      if (Array.isArray(g)) {
        // raw v2 queue array — or the editor's array-masquerading hook
        // whose OWN push/remove shadow Array.prototype
        g.push(entry);
      } else if (
        g &&
        typeof (g as ComviHook).push === "function" &&
        typeof (g as ComviHook).remove === "function"
      ) {
        // v2 hook object — incl. dual-protocol hooks that also expose
        // register; probed BEFORE legacy so new/new never downgrades to v1
        (g as ComviHook).push(entry);
      } else if (g && typeof (g as LegacyComviRegistry).register === "function") {
        // register-WITHOUT-remove ⇒ genuine legacy registry; two-arg
        // signature so its get(id) actually resolves
        (g as LegacyComviRegistry).register(self.instanceId, this);
      } else if (!g) {
        window.__COMVI__ = [entry];
      }
      // truthy non-conforming global: leave it alone, skip exposure
    } catch {
      /* discovery must never break construction */
    }
    installEditorLoader(options);
  }

  /**
   * @internal `_disposeDevtools` hook — identity-based removal from the global
   * `__COMVI__` queue, probed in the same order as exposure: array (raw queue
   * splice, or a masquerading hook's OWN remove) → hook remove → legacy
   * unregister. `Array.isArray` FIRST is what keeps a page-defined
   * `Array.prototype.remove` polyfill out of the raw-queue path: consulting
   * `g.remove` first would hand our entry OBJECT to a polyfill expecting an
   * index, which coerces to 0 and splices someone else's live entry, and the
   * try/catch below cannot see it because the wrong thing succeeded.
   * Runs at the very top of `destroy()`.
   */
  protected _disposeDevtools(): void {
    if (!this.instanceId || typeof window === "undefined") return;
    try {
      const g = window.__COMVI__ as unknown;
      const entry = this._globalEntry;
      if (Array.isArray(g)) {
        // A masquerading consumer hook's OWN remove shadows Array.prototype,
        // so it still gets the identity-based call it published.
        if (
          Object.prototype.hasOwnProperty.call(g, "remove") &&
          typeof (g as unknown as ComviHook).remove === "function"
        ) {
          if (entry) (g as unknown as ComviHook).remove(entry);
        } else {
          const idx = entry ? g.indexOf(entry) : -1;
          if (idx !== -1) g.splice(idx, 1);
        }
      } else if (g && typeof (g as ComviHook).remove === "function") {
        if (entry) (g as ComviHook).remove(entry);
      } else if (g && typeof (g as LegacyComviRegistry).unregister === "function") {
        (g as LegacyComviRegistry).unregister!(this.instanceId);
      }
    } catch {
      /* removal must never break destroy */
    }
    this._globalEntry = undefined;
  }
}

/**
 * Make a base instance discoverable by browser devtools extensions.
 *
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { attachDevtools } from "@comvi/core/devtools";
 *
 * const i18n = attachDevtools(createI18n({ locale: "en" }));
 * i18n.instanceId; // "comvi-1"
 * ```
 *
 * `instanceId` / `exposeGlobal` are passed HERE, not to `createI18n`: the base
 * instance has no discovery code to configure, so those two constructor options are
 * inert until this capability is composed on. The composite installs it in its
 * constructor and therefore still reads both options off `I18nOptions`.
 *
 * Idempotent via a dot-access probe on an installed hook — never `in`, never a
 * string key (see the mangling contract above). The members land as
 * non-enumerable own properties, so `Object.keys(i18n)` and spread copies see
 * only the public `instanceId`.
 *
 * IDEMPOTENCY IS PER EXPOSURE, NOT PER INSTALL. `_initDevtools` returns early
 * on `exposeGlobal: false`, so an install-only probe would let an instance that
 * opted out — the SSR construct — stay unexposed forever once the client
 * flipped `exposeGlobal` back on:
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(devtools({ exposeGlobal: false }));
 * // …hydrate…
 * i18n.use(devtools({ exposeGlobal: true, instanceId: "app" })); // now exposes
 * ```
 *
 * Exposure therefore re-runs while the instance has NOT been exposed, and
 * `instanceId` is the receipt for that — not `_globalEntry`. Assigning an id
 * is the FIRST thing exposure does and the one thing it always does:
 * `_initDevtools` assigns the id and then returns before `_globalEntry` when
 * there is no `window`, so probing the queue entry would re-fire on every later
 * call under SSR, reassigning the id and bumping the instance counter. Opting
 * out assigns no id, which is exactly what makes this probe the right one.
 *
 * An instance exposed WITHOUT a window therefore stays quiet even if a `window`
 * appears later: it has an id, so it is done. That is deliberate — the client
 * constructs its own instance rather than re-attaching the server's. The
 * flip-it-on case above works because opting out never assigned an id at all.
 *
 * Once exposed, every later call is a true no-op: the `instanceId` assigned
 * first wins, nothing is pushed twice, and a `destroy()`d instance (which clears
 * `_globalEntry` but keeps its id) is not resurrected.
 */
export function attachDevtools<T extends I18nBase<any>>(i18n: T, options?: DevtoolsOptions): T {
  const i = i18n as unknown as I18nInternal;
  const fresh = i._disposeDevtools === undefined;
  if (fresh) {
    const { constructor: _ctor, ...api } = Object.getOwnPropertyDescriptors(
      I18nWithDevtools.prototype,
    );
    Object.defineProperties(i, api);
  }
  if (fresh || i.instanceId === undefined) {
    i._initDevtools!(options?.instanceId, options?.exposeGlobal, options);
  }
  return i18n;
}
