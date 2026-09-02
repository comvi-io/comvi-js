import { setContext, getContext } from "svelte";
import type { WrapperI18nHost } from "@comvi/core";

/**
 * Loader/plugin-host capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()`, so the context accepts a host that
 * never had them.
 */
type Host = WrapperI18nHost;

/**
 * A host with ANY default-params type — what the context setter accepts.
 *
 * `I18nCoreInstance` declares `setDefaultParams` as a PROPERTY rather than a
 * method, so `strictFunctionTypes` checks its parameter contravariantly and
 * the host is INVARIANT in `D`: an instance from `createI18n({ defaultParams })`
 * was not assignable to `WrapperI18nHost<{}>` at all, so it could not be
 * passed in.
 *
 * Making the boundary generic over `D` does NOT fix it. Every `D` position in
 * the host is either a conditional type (`SetDefaultParamsArg<D>`,
 * `ParamsArg<K, D>`) or a bivariant method, so `D` has no inference site: it
 * silently falls back to the constraint and the call fails just the same.
 *
 * Widening the two members that carry the invariance is what actually works.
 * `setDefaultParams` is the source; `init()` re-imports it by returning the
 * host recursively. Every other `D` occurrence is a method (bivariant) or a
 * return type (covariant), so nothing else has to move.
 *
 * Both are widened with METHOD syntax and `any` rather than `never` /
 * `unknown` on purpose: methods are bivariant, so the result stays assignable
 * to `WrapperI18nHost<{}>` in BOTH directions. Everything downstream that
 * expects the plain host keeps compiling, and no internal cast is needed.
 */
export type AnyI18nHost = Omit<WrapperI18nHost, "setDefaultParams" | "init"> & {
  setDefaultParams(params: any): void;
  init(): Promise<any>;
};

const I18N_CONTEXT_KEY = Symbol.for("comvi-i18n");

export interface SetI18nContextOptions {
  /**
   * Call `i18n.init()` if it has not been initialized (default: true).
   *
   * The auto-init runs in a MICROTASK, so an immediate manual
   * `await i18n.init()` in the same component setup still wins and there is no
   * double-init.
   */
  autoInit?: boolean;
}

/**
 * Call this in the root component (`App.svelte`, `+layout.svelte`).
 *
 * @example Guaranteed ready before the first render
 * ```svelte
 * <script>
 *   setI18nContext(i18n);
 *   await i18n.init();
 * </script>
 * ```
 */
export function setI18nContext(i18n: AnyI18nHost, options?: SetI18nContextOptions): void {
  setContext(I18N_CONTEXT_KEY, i18n);

  if ((options?.autoInit ?? true) && !i18n.isInitialized && !i18n.isInitializing) {
    void Promise.resolve().then(() => {
      if (!i18n.isInitialized && !i18n.isInitializing) {
        return i18n.init().catch(() => {});
      }
    });
  }
}

/** @throws if no ancestor called `setI18nContext`. */
export function getI18nContext(): Host {
  const i18n = getContext<Host>(I18N_CONTEXT_KEY);

  if (!i18n) {
    throw new Error(
      "[@comvi/svelte] i18n context not found. " +
        "Call setI18nContext(i18n) in your root component (e.g., App.svelte).",
    );
  }

  return i18n;
}
