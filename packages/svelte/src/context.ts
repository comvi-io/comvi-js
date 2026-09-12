import { setContext, getContext } from "svelte";
import type { AnyI18nHost, WrapperI18nHost } from "@comvi/core";

/**
 * Loader/plugin-host capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()`, so the context accepts a host that
 * never had them.
 */
type Host = WrapperI18nHost;

// `AnyI18nHost` is core's: the `strictFunctionTypes` invariance in `D` it
// widens is documented there, once, for all three providers that accept it.
export type { AnyI18nHost };

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

  /**
   * Called when the auto-init above rejects — the per-app hook react's and
   * solid's providers expose as a provider prop. Nothing else can observe that
   * rejection: the init runs in a microtask this function does not return.
   *
   * The host's own `onError` (the `createI18n({ onError })` option) still
   * reports the failure FIRST, with `{ source: "init" }`; this handler is for
   * the app that wants to react in the component tree, not to replace it.
   *
   * Without a handler the rejection stays swallowed, exactly as before.
   */
  onError?: (error: Error) => void;
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
        return i18n.init().catch((error: unknown) => {
          options?.onError?.(error as Error);
        });
      }
    });
  }
}

/**
 * The host the nearest `setI18nContext` ancestor provided, as a bare
 * `WrapperI18nHost` — THE name for "give me the host", the same in react,
 * solid and svelte (vue's equivalent is `inject(I18N_INJECTION_KEY).core`).
 * A context reader, so callable during component initialisation only.
 *
 * @throws if no ancestor called `setI18nContext`.
 */
export function useI18nHost(): Host {
  const i18n = getContext<Host>(I18N_CONTEXT_KEY);

  if (!i18n) {
    throw new Error(
      "[@comvi/svelte] i18n context not found. " +
        "Call setI18nContext(i18n) in your root component (e.g., App.svelte).",
    );
  }

  return i18n;
}

/**
 * @deprecated Use `useI18nHost()` — the same host under the one name react,
 *   solid and svelte share (`use*`, not `get*`, so one grep finds it in all
 *   three). Scheduled for removal in the next major.
 */
export function getI18nContext(): Host {
  return useI18nHost();
}
