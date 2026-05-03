import { setContext, getContext } from "svelte";
import type { I18n } from "@comvi/core";

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
export function setI18nContext(i18n: I18n, options?: SetI18nContextOptions): void {
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
export function getI18nContext(): I18n {
  const i18n = getContext<I18n>(I18N_CONTEXT_KEY);

  if (!i18n) {
    throw new Error(
      "[@comvi/svelte] i18n context not found. " +
        "Call setI18nContext(i18n) in your root component (e.g., App.svelte).",
    );
  }

  return i18n;
}
