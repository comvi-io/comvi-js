import {
  createContext,
  useContext,
  createEffect,
  createMemo,
  type JSX,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import type { I18n } from "@comvi/core";
import {
  createLocaleSignal,
  createDefaultNamespaceSignal,
  createLoadingSignal,
  createInitializingSignal,
  createInitializedSignal,
  createCacheRevisionSignal,
} from "./primitives";

export interface I18nContextValue {
  /** The i18n instance */
  i18n: I18n;
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
  i18n: I18n;
  /** Whether to auto-initialize Comvi i18n on mount (default: true) */
  autoInit?: boolean;
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
  // Auto-initialize on mount or when props.i18n changes
  createEffect(() => {
    if (props.autoInit !== false && !props.i18n.isInitialized && !props.i18n.isInitializing) {
      props.i18n.init().catch(() => {
        // init() already calls reportError before rethrowing
      });
    }
  });

  // Recreate signals whenever props.i18n changes.
  // createMemo manages its own owner context and automatically cleans up
  // previous subscriptions when re-evaluating.
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
export function useI18nContext(): I18n {
  return useI18nContextValue().i18n;
}
