import { setContext, getContext } from "svelte";
import type { WrapperI18nHost } from "@comvi/core";

/**
 * Loader/plugin-host capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()`, so the context accepts a host that
 * never had them.
 */
type Host = WrapperI18nHost;

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
export function setI18nContext(i18n: Host, options?: SetI18nContextOptions): void {
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
