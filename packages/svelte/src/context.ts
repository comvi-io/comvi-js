import { setContext, getContext } from "svelte";
import type { WrapperI18nHost } from "@comvi/core";

/**
 * Host type every svelte binding demands (framework-slim D′): the reactive
 * translation host, exactly what a bare `@comvi/core/slim` instance
 * implements. Loader/plugin-host capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()` (plan §3.2), so the context accepts a
 * host that never had them.
 */
type Host = WrapperI18nHost;

const I18N_CONTEXT_KEY = Symbol.for("comvi-i18n");

export interface SetI18nContextOptions {
  /**
   * Whether to automatically call i18n.init() if not already initialized.
   * Defaults to true for consistency with other framework bindings.
   *
   * Auto-init runs in a microtask so an immediate manual `await i18n.init()`
   * in the same component setup still wins without causing double-init.
   */
  autoInit?: boolean;
}

/**
 * Set the i18n instance in Svelte context
 * Should be called in the root component (e.g., App.svelte or +layout.svelte)
 *
 * @example
 * ```svelte
 * <script>
 *   import { setI18nContext } from '@comvi/svelte';
 *   import { i18n } from './lib/i18n';
 *
 *   setI18nContext(i18n);
 * </script>
 *
 * <slot />
 * ```
 *
 * @example Guaranteed ready before first render
 * ```svelte
 * <script>
 *   import { setI18nContext } from '@comvi/svelte';
 *   import { i18n } from './lib/i18n';
 *
 *   setI18nContext(i18n);
 *   await i18n.init();
 * </script>
 *
 * <slot />
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

/**
 * Get the i18n instance from Svelte context
 * Must be called within a component that has i18n context set
 *
 * @returns The i18n instance
 * @throws Error if called outside of i18n context
 */
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
