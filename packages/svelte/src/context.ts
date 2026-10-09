import { setContext, getContext } from "svelte";
import type { AnyI18nInstance, WrapperI18nInstance } from "@comvi/core";
import { autoInitPending, syncInitializing } from "./stores.js";

/**
 * Loader/plugin capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()`, so the context accepts an instance that
 * never had them.
 */
type Instance = WrapperI18nInstance;

// `AnyI18nInstance` is core's: the `strictFunctionTypes` invariance in `D` it
// widens is documented there, once, for all three providers that accept it.
export type { AnyI18nInstance };

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
   * The instance's own `onError` (the `createI18n({ onError })` option) still
   * reports the failure FIRST, with `{ source: "init" }`; this handler is for
   * the app that wants to react in the component tree, not to replace it.
   *
   * Without a handler the rejection stays swallowed, exactly as before.
   */
  onError?: (error: Error) => void;
}

/**
 * Matches react's/solid's/vue's own auto-init catch: `onError` is typed to
 * receive an `Error`, so a non-Error rejection (a thrown string, object, …)
 * is normalized here rather than cast past the type system. `cause` keeps
 * the original value reachable — assigned rather than passed through the
 * `Error` constructor's options so this compiles under the repo's ES2020
 * `lib` target too.
 */
function normalizeInitError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const normalized: Error & { cause?: unknown } = new Error(String(error));
  normalized.cause = error;
  return normalized;
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
export function setI18nContext(i18n: AnyI18nInstance, options?: SetI18nContextOptions): void {
  setContext(I18N_CONTEXT_KEY, i18n);

  if ((options?.autoInit ?? true) && !i18n.isInitialized && !i18n.isInitializing) {
    // `isInitializing` reads true from now until the init below starts (or a
    // manual one already has): the first render is inside the gate.
    autoInitPending.add(i18n);
    void Promise.resolve().then(() => {
      // `init()` raises `isInitializing` synchronously, before its first
      // await, so dropping the mark after the call never opens the gate.
      const started =
        !i18n.isInitialized &&
        !i18n.isInitializing &&
        i18n.init().catch((error: unknown) => {
          options?.onError?.(normalizeInitError(error));
        });
      autoInitPending.delete(i18n);
      syncInitializing(i18n);
      return started;
    });
  }
}

/**
 * The instance the nearest `setI18nContext` ancestor provided, as a bare
 * `WrapperI18nInstance` — THE name for "give me the instance", the same in react,
 * solid and svelte (vue's equivalent is `inject(I18N_INJECTION_KEY).core`).
 * A context reader, so callable during component initialisation only.
 *
 * @throws if no ancestor called `setI18nContext`.
 */
export function useI18nInstance(): Instance {
  const i18n = getContext<Instance>(I18N_CONTEXT_KEY);

  if (!i18n) {
    throw new Error(
      "[@comvi/svelte] i18n context not found. " +
        "Call setI18nContext(i18n) in your root component (e.g., App.svelte).",
    );
  }

  return i18n;
}
