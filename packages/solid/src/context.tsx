import {
  createContext,
  useContext,
  createEffect,
  createMemo,
  type JSX,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import type { WrapperI18nHost } from "@comvi/core";
import {
  createLocaleSignal,
  createDefaultNamespaceSignal,
  createLoadingSignal,
  createInitializingSignal,
  createInitializedSignal,
  createCacheRevisionSignal,
} from "./primitives";

/**
 * Loader/plugin-host capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()`, so the Provider accepts a host that
 * never had them.
 */
export interface I18nContextValue {
  i18n: WrapperI18nHost;
  /** Bound to the Provider's lifecycle, not the consumer's. */
  signals: {
    locale: Accessor<string>;
    defaultNamespace: Accessor<string>;
    isLoading: Accessor<boolean>;
    isInitializing: Accessor<boolean>;
    isInitialized: Accessor<boolean>;
    cacheRevision: Accessor<number>;
  };
}

const I18nContext = createContext<I18nContextValue>();

export interface I18nProviderProps {
  i18n: WrapperI18nHost;
  /** Auto-initialize the instance on mount (default: true). */
  autoInit?: boolean;
  /**
   * Called if auto-initialization fails. Core's configured error handler has
   * already reported the error by then; this only lets the app observe it too.
   */
  onError?: (error: Error) => void;
  children: JSX.Element;
}

export const I18nProvider: ParentComponent<I18nProviderProps> = (props) => {
  // `isInitialized`/`isInitializing` are plain non-reactive getters, read here
  // only as a re-entry guard: the effect re-runs on `props.i18n` /
  // `props.autoInit` alone, by design.
  createEffect(() => {
    if (props.autoInit !== false && !props.i18n.isInitialized && !props.i18n.isInitializing) {
      props.i18n.init().catch((err: unknown) => {
        // Already reported through core's error handler; this is the extra hop
        // to the optional prop.
        props.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });

  // The `from()` signals MUST be created directly in this memo's reactive
  // scope. Wrapping them in `untrack(...)` or a detached `createRoot(...)`
  // detaches their cleanups from the memo's owner and leaks the core event
  // subscriptions whenever `props.i18n` is swapped.
  const signalsMemo = createMemo(() => ({
    locale: createLocaleSignal(props.i18n),
    defaultNamespace: createDefaultNamespaceSignal(props.i18n),
    isLoading: createLoadingSignal(props.i18n),
    isInitializing: createInitializingSignal(props.i18n),
    isInitialized: createInitializedSignal(props.i18n),
    cacheRevision: createCacheRevisionSignal(props.i18n),
  }));

  // Getters, so the context object's identity stays stable while still
  // pointing at the current instance's signals.
  const signals = {
    get locale() {
      return signalsMemo().locale;
    },
    get isLoading() {
      return signalsMemo().isLoading;
    },
    get defaultNamespace() {
      return signalsMemo().defaultNamespace;
    },
    get isInitializing() {
      return signalsMemo().isInitializing;
    },
    get isInitialized() {
      return signalsMemo().isInitialized;
    },
    get cacheRevision() {
      return signalsMemo().cacheRevision;
    },
  };

  return (
    <I18nContext.Provider
      value={{
        get i18n() {
          return props.i18n;
        },
        signals,
      }}
    >
      {props.children}
    </I18nContext.Provider>
  );
};

export function useI18nContextValue(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error(
      "[@comvi/solid] i18n context not found. " + "Wrap your app with <I18nProvider i18n={i18n}>.",
    );
  }
  return ctx;
}

/** @throws if called outside an `<I18nProvider>`. */
export function useI18nContext(): WrapperI18nHost {
  return useI18nContextValue().i18n;
}
