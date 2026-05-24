import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import type { I18n, FlattenedTranslations, I18nEvent } from "@comvi/core";

interface I18nContextValue {
  i18n: I18n;
  locale: string;
  translationCache: ReadonlyMap<string, FlattenedTranslations>;
  isLoading: boolean;
  isInitializing: boolean;
}

export interface I18nInstanceContextValue {
  i18n: I18n;
  isLoading: boolean;
  isInitializing: boolean;
}

// `null` default lets `useLocale` detect outside-provider use without
// subscribing to InstanceContext (which would defeat its narrow scope).
export const LocaleContext = createContext<string | null>(null);

const I18nInstanceContext = createContext<I18nInstanceContextValue | null>(null);

/** @internal — exported for unit tests, not in the package index. */
export function useSubscribe(i18n: I18n, ...events: I18nEvent[]) {
  const eventsKey = events.join("|");
  return useCallback(
    (callback: () => void) => {
      let disposed = false;
      const eventList = eventsKey.split("|") as I18nEvent[];
      const unsubs = eventList.map((e) =>
        i18n.on(e, () => {
          // Defer React's store-update notification out of the synchronous
          // _emit call stack (packages/core/src/core/i18n.ts:438-448).
          // Without deferral, callback() runs inside the emit loop while a
          // parent component is mid-render, causing scheduleUpdateOnFiber to
          // target a sibling fiber and fire the "Cannot update a component
          // while rendering a different component" warning.
          // The disposed flag prevents stale callbacks after unsubscribe.
          queueMicrotask(() => {
            if (!disposed) callback();
          });
        }),
      );
      return () => {
        disposed = true;
        unsubs.forEach((u) => u());
      };
    },
    [i18n, eventsKey],
  );
}

/** @internal — exported for unit tests, not in the package index. */
export function useStoreRevision(i18n: I18n, ...events: I18nEvent[]): string {
  const eventRevisionRef = useRef(0);
  const eventsKey = events.join("|");
  const subscribe = useCallback(
    (callback: () => void) => {
      let disposed = false;
      const eventList = eventsKey.split("|") as I18nEvent[];
      const unsubs = eventList.map((event) =>
        i18n.on(event, () => {
          // Bump revision synchronously so getSnapshot reads see the new value
          // immediately (before the deferred React notification fires).
          eventRevisionRef.current += 1;
          // Defer React's notification out of the synchronous _emit call stack
          // (packages/core/src/core/i18n.ts:438-448) so scheduleUpdateOnFiber
          // cannot land while a sibling fiber is mid-render. This significantly
          // narrows (but does not fully close) the v0.3.1 KNOWN LIMITATION race
          // at useI18n.ts:45-53; the residual window depends on React-internal
          // subscribe-set-up vs first-event ordering.
          // The disposed flag prevents stale callbacks after unsubscribe or
          // i18n prop swap (useCallback dep [i18n, eventsKey] covers the swap).
          queueMicrotask(() => {
            if (!disposed) callback();
          });
        }),
      );
      return () => {
        disposed = true;
        unsubs.forEach((unsub) => unsub());
      };
    },
    [i18n, eventsKey],
  );

  return useSyncExternalStore(
    subscribe,
    () => `${i18n.translationCache.getRevision()}:${eventRevisionRef.current}`,
    () => `${i18n.translationCache.getRevision()}:${eventRevisionRef.current}`,
  );
}

export interface I18nProviderProps {
  children: React.ReactNode;
  i18n: I18n;
  /** Auto-initialize the i18n instance on mount (default: true). */
  autoInit?: boolean;
  /** Initial locale for SSR hydration. */
  ssrInitialLocale?: string;
  /** Initial loading state for SSR hydration. */
  ssrInitialIsLoading?: boolean;
  /** Initial initializing state for SSR hydration. */
  ssrInitialIsInitializing?: boolean;
  /** Error handler for initialization failures. Defaults to `console.error`. */
  onError?: (error: Error) => void;
}

/**
 * Wraps your app to provide i18n functionality to all child components.
 * Auto-initializes the i18n instance on mount.
 *
 * @example
 * ```tsx
 * const i18n = createI18n({ locale: 'en', translation: {...} });
 * <I18nProvider i18n={i18n}><App /></I18nProvider>
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

  const subLang = useSubscribe(i18n, "localeChanged", "initialized", "configChanged");
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

I18nProvider.displayName = "I18nProvider";

/** @internal */
export function useI18nInstance(): I18nInstanceContextValue {
  const instance = useContext(I18nInstanceContext);
  if (!instance) {
    throw new Error("[i18n] Hooks must be used within an I18nProvider.");
  }
  return instance;
}

/**
 * Read the current locale. Subscribes only to locale changes — non-translation
 * consumers (e.g. `<Link>`, `usePathname()`) prefer this over `useI18n()` to
 * skip re-renders on namespace loads and loading-state changes.
 */
export function useLocale(): string {
  const locale = useContext(LocaleContext);
  if (locale === null) {
    throw new Error("[i18n] useLocale must be used within an I18nProvider.");
  }
  return locale;
}

/** Read `{ isLoading, isInitializing }` slice. */
export function useIsLoading(): { isLoading: boolean; isInitializing: boolean } {
  const { isLoading, isInitializing } = useI18nInstance();
  return { isLoading, isInitializing };
}

/**
 * Legacy combined-context shape. Re-renders on every reactive axis.
 *
 * @deprecated Use `useI18n()` or the per-axis selector hooks `useLocale()` /
 *   `useIsLoading()`. Scheduled for removal in the next major.
 */
export function useI18nContext(): I18nContextValue {
  const { i18n, isLoading, isInitializing } = useI18nInstance();
  const locale = useContext(LocaleContext) ?? "";

  const storeRevision = useStoreRevision(
    i18n,
    "namespaceLoaded",
    "initialized",
    "translationsCleared",
    "configChanged",
    "defaultNamespaceChanged",
  );
  const translationCache = i18n.translationCache.getInternalMap();

  return useMemo<I18nContextValue>(
    () => ({ i18n, locale, translationCache, isLoading, isInitializing }),
    [i18n, locale, translationCache, isLoading, isInitializing, storeRevision],
  );
}
