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
 * Host type every solid binding demands (framework-slim D′): the reactive
 * translation host, exactly what the base `@comvi/core` / `@comvi/solid`
 * factory builds. Loader/plugin-host capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()` (plan §3.2), so the Provider accepts
 * a host that never had them.
 */
export interface I18nContextValue {
  /** The i18n instance */
  i18n: WrapperI18nHost;
  /** Shared reactive signals bound to the Provider's lifecycle */
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
  /** The i18n instance */
  i18n: WrapperI18nHost;
  /** Whether to auto-initialize Comvi i18n on mount (default: true) */
  autoInit?: boolean;
  /**
   * Called if auto-initialization fails. The error is already reported through
   * core's configured error handler before this runs; this prop lets the app
   * observe the failure too (parity with the other framework bindings).
   */
  onError?: (error: Error) => void;
  /** Child components */
  children: JSX.Element;
}

/**
 * Provider component that makes i18n available to all child components
 *
 * @example
 * ```tsx
 * import { I18nProvider } from '@comvi/solid';
 * import { i18n } from './i18n';
 *
 * function App() {
 *   return (
 *     <I18nProvider i18n={i18n}>
 *       <MyApp />
 *     </I18nProvider>
 *   );
 * }
 * ```
 */
export const I18nProvider: ParentComponent<I18nProviderProps> = (props) => {
  // Auto-initialize on mount or when props.i18n changes.
  // `isInitialized`/`isInitializing` are plain (non-reactive) getters on the
  // instance, read here only as a one-shot guard against re-entry — the effect
  // intentionally re-runs only when props.i18n or props.autoInit change.
  createEffect(() => {
    if (props.autoInit !== false && !props.i18n.isInitialized && !props.i18n.isInitializing) {
      props.i18n.init().catch((err: unknown) => {
        // init() already reports the error through core's error handler before
        // rethrowing; surface it to the optional onError prop as well.
        props.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });

  // Recreate signals whenever props.i18n changes.
  // createMemo manages its own owner context and automatically cleans up
  // previous subscriptions when re-evaluating.
  // NOTE: the `from()` signals below MUST be created directly in this memo's
  // reactive scope. Do not wrap them in `untrack(...)` or a detached
  // `createRoot(...)` — that would detach their cleanups from the memo's owner
  // and leak the core event subscriptions when props.i18n is swapped.
  const signalsMemo = createMemo(() => ({
    locale: createLocaleSignal(props.i18n),
    defaultNamespace: createDefaultNamespaceSignal(props.i18n),
    isLoading: createLoadingSignal(props.i18n),
    isInitializing: createInitializingSignal(props.i18n),
    isInitialized: createInitializedSignal(props.i18n),
    cacheRevision: createCacheRevisionSignal(props.i18n),
  }));

  // Map to stable getters so the context object reference remains stable
  // but always points to the latest signals from the current i18n instance.
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

/**
 * Get the full i18n context (instance + shared signals)
 *
 * @returns The i18n context value
 * @throws Error if called outside of I18nProvider
 */
export function useI18nContextValue(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error(
      "[@comvi/solid] i18n context not found. " + "Wrap your app with <I18nProvider i18n={i18n}>.",
    );
  }
  return ctx;
}

/**
 * Get the i18n instance from SolidJS context (for backward compatibility)
 *
 * @returns The i18n instance
 * @throws Error if called outside of I18nProvider
 */
export function useI18nContext(): WrapperI18nHost {
  return useI18nContextValue().i18n;
}
