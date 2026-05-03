import { createContext, useContext, useEffect, useMemo, useCallback } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import type { I18n, FlattenedTranslations, I18nEvent } from "@comvi/core";

/**
 * Context value interface
 */
interface I18nContextValue {
  i18n: I18n;
  locale: string;
  translationCache: ReadonlyMap<string, FlattenedTranslations>;
  isLoading: boolean;
  isInitializing: boolean;
}

/**
 * React Context for i18n
 */
const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Create a memoized subscribe function for useSyncExternalStore
 */
function useSubscribe(i18n: I18n, events: I18nEvent[]) {
  return useCallback(
    (callback: () => void) => {
      const unsubs = events.map((e) => i18n.on(e, () => callback()));
      return () => unsubs.forEach((u) => u());
    },
    [i18n], // events array is static at each call site
  );
}

/**
 * Props for I18nProvider component
 */
export interface I18nProviderProps {
  children: React.ReactNode;
  i18n: I18n;
  /**
   * Whether to auto-initialize the i18n instance on mount (default: true)
   * Set to false if you want to manually control initialization
   */
  autoInit?: boolean;
  /**
   * Initial locale for SSR hydration (optional)
   * Prevents hydration mismatches by providing explicit server-side initial state
   */
  ssrInitialLocale?: string;
  /**
   * Initial loading state for SSR hydration (optional)
   * Prevents hydration mismatches by providing explicit server-side initial state
   */
  ssrInitialIsLoading?: boolean;
  /**
   * Initial initializing state for SSR hydration (optional)
   * Prevents hydration mismatches by providing explicit server-side initial state
   */
  ssrInitialIsInitializing?: boolean;
  /**
   * Error handler for initialization failures (optional)
   * If not provided, errors are logged to console
   *
   * @example
   * ```tsx
   * <I18nProvider
   *   i18n={i18n}
   *   onError={(error) => {
   *     console.error('i18n initialization failed:', error);
   *     // Show error UI, retry, etc.
   *   }}
   * >
   *   <App />
   * </I18nProvider>
   * ```
   */
  onError?: (error: Error) => void;
}

/**
 * I18nProvider component
 * Wraps your app to provide i18n functionality to all child components
 *
 * The provider auto-initializes the i18n instance on mount, so you don't need
 * to manually call `i18n.init()` before rendering.
 *
 * @example
 * ```tsx
 * import { createI18n } from '@comvi/core';
 * import { I18nProvider } from '@comvi/react';
 *
 * const i18n = createI18n({ locale: 'en', translation: {...} });
 *
 * function App() {
 *   return (
 *     <I18nProvider i18n={i18n}>
 *       <YourApp />
 *     </I18nProvider>
 *   );
 * }
 * ```
 */
export function I18nProvider({
  children,
  i18n,
  autoInit = true,
  ssrInitialLocale,
  ssrInitialIsLoading = false,
  ssrInitialIsInitializing = false,
  onError,
}: I18nProviderProps) {
  // Auto-initialize if not already done (fire-and-forget for progressive loading)
  // This matches Vue's behavior where app.use(i18n) auto-initializes Comvi i18n
  // Uses isInitialized flag to ensure init() is called even when translations are pre-loaded
  useEffect(() => {
    if (autoInit && !i18n.isInitialized && !i18n.isInitializing) {
      i18n.init().catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        if (onError) {
          onError(error);
        } else {
          console.error("[i18n] Initialization failed:", error);
        }
      });
    }
  }, [i18n, autoInit, onError]);

  // Subscribe to reactive state from core using useSyncExternalStore
  const subLang = useSubscribe(i18n, ["localeChanged", "initialized"]);
  const subCache = useSubscribe(i18n, ["namespaceLoaded", "initialized", "translationsCleared"]);
  const subLoading = useSubscribe(i18n, ["loadingStateChanged", "initialized"]);

  const locale = useSyncExternalStore(
    subLang,
    () => i18n.locale,
    () => ssrInitialLocale ?? i18n.locale,
  );

  // Cache revision for O(1) change detection (no Map cloning)
  const cacheRevision = useSyncExternalStore(
    subCache,
    () => i18n.translationCache.getRevision(),
    () => i18n.translationCache.getRevision(),
  );
  const cache = i18n.translationCache.getInternalMap();

  const isLoading = useSyncExternalStore(
    subLoading,
    () => i18n.isLoading,
    () => ssrInitialIsLoading,
  );
  const isInitializing = useSyncExternalStore(
    subLoading,
    () => i18n.isInitializing,
    () => ssrInitialIsInitializing,
  );

  // Memoize context value to prevent unnecessary re-renders
  // cacheRevision is included to trigger re-renders when translations change
  // Note: 'cache' is excluded from dependencies since the Map reference is stable;
  // cacheRevision changes when translations are added/updated (O(1) change detection)
  const value = useMemo(
    () => ({
      i18n,
      locale,
      translationCache: cache,
      isLoading,
      isInitializing,
    }),
    [i18n, locale, isLoading, isInitializing, cacheRevision],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Add display name for React DevTools
I18nProvider.displayName = "I18nProvider";

/**
 * Hook to access the i18n context
 * Must be used within an I18nProvider
 *
 * @returns The i18n context value
 * @throws Error if used outside I18nProvider
 */
export function useI18nContext(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error(
      "[i18n] useI18nContext must be used within an I18nProvider. " +
        "Make sure your component is wrapped with <I18nProvider>.",
    );
  }

  return context;
}
