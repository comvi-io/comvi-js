// Browser-extension discovery capability — the implementation half of
// `@comvi/core/devtools`.
//
// Everything that makes an instance findable by a devtools extension lives
// here and NOWHERE else: the `window.__COMVI__` protocol probe, the version
// stamp, the instance-id counter, and the identity-based removal on destroy.
// A bare `@comvi/core/slim` instance therefore never carries the protocol —
// it is absent from the module graph, not disabled by a flag.
//
// ONE implementation, TWO install surfaces, exactly like `core/loader.ts`:
//   • root — `core/full.ts` installs `devtoolsApi` on `I18n.prototype` and
//            calls `_initDevtools` from its constructor, so root behaviour is
//            byte-for-byte what it was before the extraction;
//   • slim — `attachDevtools(i18n)` copies the same prototype descriptors
//            onto the instance and then exposes it.
// The descriptor copy (never a plain `i._x = fn` assignment) is what keeps
// the hooks NON-ENUMERABLE, which the root reflective contract asserts:
// `{ ...i18n }` must carry data only, never behaviour.
//
// MANGLING CONTRACT (plan R2): `_globalEntry`, `_initDevtools` and
// `_disposeDevtools` are renamed by the single shared terser nameCache in
// `vite.shared.ts#mangleInternalProps`. Dot access only — never a string key.
import type { ComviHook, ComviQueueEntry, DefaultTranslationParams } from "../types";
import { I18n as I18nBase, type I18nInternal } from "./i18n";

declare const __VERSION__: string | undefined;

/** Library version — injected at build time or fallback. */
const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.1.0";

/** Counter for auto-generating instance IDs. */
let instanceCounter = 0;

/**
 * v1 legacy registry shape (`register` WITHOUT `remove`) — mixed-version
 * interop only: an old core on the same page may have installed it.
 */
interface LegacyComviRegistry {
  register(id: string, instance: I18nBase): void;
  unregister?(id: string): void;
}

/** Discovery options; the same two fields the root entry reads off `I18nOptions`. */
export interface DevtoolsOptions {
  /**
   * Stable id for this instance. Auto-generated (`comvi-<n>`) when omitted.
   */
  instanceId?: string;
  /**
   * Expose on `window.__COMVI__`. Defaults to `true` in a browser and `false`
   * under SSR — the same default the root entry has always applied.
   */
  exposeGlobal?: boolean;
}

/**
 * The discovery capability. Not exported from any entry point: the root entry
 * installs its prototype descriptors in `core/full.ts`, the slim entry gets
 * them from `attachDevtools`.
 */
export class I18nWithDevtools<D extends DefaultTranslationParams = {}> extends I18nBase<D> {
  /** Entry pushed onto `window.__COMVI__` — kept for identity-based removal. */
  declare protected _globalEntry?: ComviQueueEntry;

  /**
   * Assign the instance id and expose on the discovery queue. Called by the
   * root constructor and by `attachDevtools`; this class declares no
   * constructor of its own.
   */
  protected _initDevtools(instanceId?: string, exposeGlobal?: boolean): void {
    // Default to exposure in browser environments, silence in SSR.
    if (!(exposeGlobal ?? typeof window !== "undefined")) return;

    const self = this as unknown as I18nInternal;
    self.instanceId = instanceId || `comvi-${++instanceCounter}`;
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
  }

  /**
   * @internal `_disposeDevtools` hook — remove from the global `__COMVI__`
   * queue (identity-based; defensive: hook/masquerading-array remove → raw
   * array splice → legacy unregister). Runs at the very top of `destroy()`,
   * the exact position the inline block occupied before the extraction.
   */
  protected _disposeDevtools(): void {
    if (!this.instanceId || typeof window === "undefined") return;
    try {
      const g = window.__COMVI__ as unknown;
      const entry = this._globalEntry;
      if (g && typeof (g as ComviHook).remove === "function") {
        if (entry) (g as ComviHook).remove(entry);
      } else if (Array.isArray(g)) {
        const idx = entry ? g.indexOf(entry) : -1;
        if (idx !== -1) g.splice(idx, 1);
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
 * Prototype descriptors of the capability, minus `constructor` — installing
 * that would repoint `instance.constructor` at the capability class.
 *
 * @internal Shared by `attachDevtools` and the root install in `core/full.ts`.
 */
const { constructor: _ctor, ...devtoolsApi } = Object.getOwnPropertyDescriptors(
  I18nWithDevtools.prototype,
);
export { devtoolsApi };

/**
 * Make a slim instance discoverable by browser devtools extensions.
 *
 * ```ts
 * import { createI18n } from "@comvi/core/slim";
 * import { attachDevtools } from "@comvi/core/devtools";
 *
 * const i18n = attachDevtools(createI18n({ locale: "en" }));
 * i18n.instanceId; // "comvi-1"
 * ```
 *
 * `instanceId` / `exposeGlobal` are passed HERE, not to `createI18n`: a bare
 * slim instance has no discovery code to configure. The root `@comvi/core`
 * entry composes this capability in for you and keeps reading both options
 * off `I18nOptions`.
 *
 * Idempotent (dot-access probe on an installed hook — never `in`, never a
 * string key: see the mangling contract above). The members land as
 * non-enumerable own properties with class-method descriptors, so
 * `Object.keys(i18n)` and spread copies see only the public `instanceId`.
 */
export function attachDevtools<T extends I18nBase<any>>(i18n: T, options?: DevtoolsOptions): T {
  const i = i18n as unknown as I18nInternal;
  if (i._disposeDevtools === undefined) {
    Object.defineProperties(i, devtoolsApi);
    i._initDevtools!(options?.instanceId, options?.exposeGlobal);
  }
  return i18n;
}
