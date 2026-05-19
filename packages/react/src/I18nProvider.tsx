import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";
import type { I18n, FlattenedTranslations, I18nEvent } from "@comvi/core";

/**
 * Legacy combined-context value shape — preserved for `useI18nContext()`
 * (deprecated). New code should use `useI18n()` or the per-axis selector
 * hooks (`useLocale`, `useIsLoading`).
 */
interface I18nContextValue {
  i18n: I18n;
  locale: string;
  translationCache: ReadonlyMap<string, FlattenedTranslations>;
  isLoading: boolean;
  isInitializing: boolean;
}

/**
 * Per-axis context value carrying the i18n instance + loading state.
 * Locale is in its own context (`LocaleContext`) so non-translation
 * consumers like `<Link>` and `usePathname()` re-render on locale change
 * only, NOT on every namespace load (which previously triggered a
 * cacheRevision-driven context-value change). See AUDIT-FINDINGS.md
 * Dimension 4 P1 + ADR docs/adr/0002-context-split.md.
 *
 * @internal
 */
export interface I18nInstanceContextValue {
  i18n: I18n;
  isLoading: boolean;
  isInitializing: boolean;
}

/**
 * Locale context — narrow string axis. Subscribed by `useLocale()`,
 * `useI18n()`, and any framework consumer that wants ONLY the current
 * locale value (not the broader i18n instance / loading state).
 *
 * Default value is `null` so the absence-of-provider check can be
 * performed against THIS context alone — without subscribing to
 * `I18nInstanceContext` (which changes on isLoading flips and would
 * defeat the cacheRevision-fan-out fix for non-translation consumers
 * like `<Link>` / `usePathname`).
 *
 * @internal — exported so `useI18n` can read it directly without paying
 *   the double provider-presence check that `useLocale()` does.
 */
export const LocaleContext = createContext<string | null>(null);

/**
 * Instance + loading-state context. Subscribed by `useI18n()`,
 * `useIsLoading()`, and `useI18nContext()` (deprecated).
 */
const I18nInstanceContext = createContext<I18nInstanceContextValue | null>(null);

/**
 * Create a memoized subscribe function for useSyncExternalStore.
 *
 * Rest-args + a `join("|")` stable key so that re-subscription correctly
 * tracks the event list (no stale closure if a caller passes a dynamic set).
 * The callback closes over `eventsKey` (a string) instead of the rest-args
 * array (which is freshly allocated each render) — identity changes only when
 * event contents change. Exported for unit testing; NOT in the package index.
 *
 * @internal
 */
export function useSubscribe(i18n: I18n, ...events: I18nEvent[]) {
  const eventsKey = events.join("|");
  return useCallback(
    (callback: () => void) => {
      const eventList = eventsKey.split("|") as I18nEvent[];
      const unsubs = eventList.map((e) => i18n.on(e, callback));
      return () => unsubs.forEach((u) => u());
    },
    [i18n, eventsKey],
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
 * In v0.3+, internally splits state across two contexts (`LocaleContext` +
 * `I18nInstanceContext`) so non-translation consumers (e.g. `<Link>`,
 * `usePathname()`) re-render only on locale changes, not on every namespace
 * load. The public `useI18n()` API surface is unchanged.
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
  // Auto-initialize if not already done (fire-and-forget for progressive loading).
  // The isInitialized / isInitializing flags double as the StrictMode-safety
  // mechanism: on the second invocation of the effect under StrictMode, the
  // guard skips because i18n.isInitializing is already true.
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

  // Subscribe to reactive state from core using useSyncExternalStore.
  // Locale and loading have separate subscriptions so we can populate two
  // independent contexts — non-translation consumers do not pay re-renders
  // on namespace loads (which the prior single-context design caused).
  const subLang = useSubscribe(i18n, "localeChanged", "initialized");
  const subLoading = useSubscribe(i18n, "loadingStateChanged", "initialized");

  const locale = useSyncExternalStore(
    subLang,
    () => i18n.locale,
    () => ssrInitialLocale ?? i18n.locale,
  );

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

  const instanceValue = useMemo<I18nInstanceContextValue>(
    () => ({ i18n, isLoading, isInitializing }),
    [i18n, isLoading, isInitializing],
  );

  return (
    <I18nInstanceContext.Provider value={instanceValue}>
      <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
    </I18nInstanceContext.Provider>
  );
}

// Add display name for React DevTools
I18nProvider.displayName = "I18nProvider";

/**
 * Internal helper used by `useI18n` and `useI18nContext` — reads the
 * instance context with a clear error message when called outside the
 * provider. NOT re-exported from the package index.
 *
 * @internal
 */
export function useI18nInstance(): I18nInstanceContextValue {
  const instance = useContext(I18nInstanceContext);
  if (!instance) {
    throw new Error(
      "[i18n] Hooks must be used within an I18nProvider. " +
        "Make sure your component is wrapped with <I18nProvider>.",
    );
  }
  return instance;
}

/**
 * Read the current locale (selector hook).
 *
 * Subscribes only to locale changes (LocaleContext). Non-translation
 * consumers like `<Link>`, `usePathname()`, and `useLocalizedRouter()`
 * use this instead of the broader `useI18n()` so they skip re-renders
 * on namespace loads AND on loading-state changes — they only re-render
 * when the locale itself changes.
 *
 * @throws Error if called outside an `<I18nProvider>`.
 */
export function useLocale(): string {
  const locale = useContext(LocaleContext);
  if (locale === null) {
    throw new Error(
      "[i18n] useLocale must be used within an I18nProvider. " +
        "Make sure your component is wrapped with <I18nProvider>.",
    );
  }
  return locale;
}

/**
 * Read loading-state slice (selector hook).
 *
 * Subscribes only to loading-state changes (and locale changes, since
 * the InstanceContext value changes when locale changes too). Loading UI
 * surfaces should prefer this over `useI18n()`.
 *
 * @throws Error if called outside an `<I18nProvider>`.
 */
export function useIsLoading(): { isLoading: boolean; isInitializing: boolean } {
  const { isLoading, isInitializing } = useI18nInstance();
  return { isLoading, isInitializing };
}

/**
 * Hook to access the i18n context — legacy combined-context shape.
 *
 * Re-renders on every reactive axis (locale, loading, cache). For new
 * code prefer `useI18n()` (same shape, narrower subscriptions internally)
 * or the per-axis selector hooks `useLocale()` / `useIsLoading()`.
 *
 * @deprecated Use `useI18n()` or `useLocale()` / `useIsLoading()`. This
 *   export is retained for v0.3 to ease migration; scheduled for removal
 *   in v0.4. See `docs/migration/v0.2-to-v0.3.md`.
 *
 * @returns The legacy `I18nContextValue` shape.
 * @throws Error if used outside `<I18nProvider>`.
 */
export function useI18nContext(): I18nContextValue {
  const { i18n, isLoading, isInitializing } = useI18nInstance();
  const locale = useContext(LocaleContext) ?? "";

  // Cache-revision subscription so this hook re-renders on namespace load
  // (legacy users depended on `translationCache` updating).
  const subCache = useSubscribe(i18n, "namespaceLoaded", "initialized", "translationsCleared");
  useSyncExternalStore(
    subCache,
    () => i18n.translationCache.getRevision(),
    () => i18n.translationCache.getRevision(),
  );
  const translationCache = i18n.translationCache.getInternalMap();

  return useMemo<I18nContextValue>(
    () => ({ i18n, locale, translationCache, isLoading, isInitializing }),
    [i18n, locale, translationCache, isLoading, isInitializing],
  );
}
