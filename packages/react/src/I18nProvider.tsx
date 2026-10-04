import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";
import { subscribeToRevision } from "@comvi/core";
import type { AnyI18nHost, WrapperI18nHost, I18nEvent } from "@comvi/core";

/** Loader/plugin capabilities are not part of it — see `capabilityHooks`. */
type Host = WrapperI18nHost;

// `AnyI18nHost` is core's: the `strictFunctionTypes` invariance in `D` it
// widens is documented there, once, for all three providers that accept it.
export type { AnyI18nHost };

export interface I18nInstanceContextValue {
  i18n: Host;
  isLoading: boolean;
  isInitializing: boolean;
}

// `null` default lets `useLocale` detect outside-provider use without
// subscribing to InstanceContext (which would defeat its narrow scope).
export const LocaleContext = createContext<string | null>(null);

const I18nInstanceContext = createContext<I18nInstanceContextValue | null>(null);

/** @internal — exported for unit tests, not in the package index. */
export function useSubscribe(i18n: Host, ...events: I18nEvent[]) {
  const eventsKey = events.join("|");
  return useCallback(
    (callback: () => void) => {
      let disposed = false;
      const eventList = eventsKey.split("|") as I18nEvent[];
      const unsubs = eventList.map((e) =>
        i18n.on(e, () => {
          // Defer out of core's synchronous `_emit` stack: undeferred, this
          // runs inside the emit loop while a parent component is mid-render,
          // and React warns "Cannot update a component while rendering a
          // different component".
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
export function useStoreRevision(i18n: Host): string {
  const subscribe = useCallback(
    (callback: () => void) => {
      let disposed = false;
      // Core's canonical revision event set: never hand-copy a subset here.
      const unsubscribe = subscribeToRevision(i18n, () => {
        // Defer out of the synchronous _emit stack to avoid mid-render setState.
        queueMicrotask(() => {
          if (!disposed) callback();
        });
      });
      return () => {
        disposed = true;
        unsubscribe();
      };
    },
    [i18n],
  );

  // Content-addressed, not counter-based, so an event that fires before the
  // subscribe effect attaches is still detected on the post-subscribe read.
  const getSnapshot = useCallback(
    () =>
      `${i18n.messagesCache.getRevision()}:${i18n.isInitialized ? 1 : 0}:` +
      `${i18n.getDefaultNamespace()}:${i18n.getActiveNamespaces().join(",")}:` +
      `${i18n.getFallbackLocales().join(",")}:${i18n.configRevision}:` +
      `${i18n.locale}:${i18n.isLoading ? 1 : 0}:${i18n.isInitializing ? 1 : 0}`,
    [i18n],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface I18nProviderProps {
  children: React.ReactNode;
  /** Any host, whatever default-params type it carries. */
  i18n: AnyI18nHost;
  /** Auto-initialize the i18n instance on mount (default: true). */
  autoInit?: boolean;
  /**
   * Rendered INSTEAD of `children` until the host is INITIALIZED, so no
   * CLIENT paint is ever a flash of raw keys. Omit it and `children` render
   * throughout, exactly as before this prop existed.
   *
   * The axis is `isInitialized`, not `isInitializing`: `init()` starts from an
   * effect, after the first render, so a gate on "is it initializing" is open
   * for exactly the frame the raw keys would paint in. With `autoInit: false`
   * the fallback therefore stays until your app calls `i18n.init()` itself.
   *
   * On the server the SSR snapshot decides, and it is NOT gated by default:
   * `ssrInitialIsInitializing` is `false`, so `children` render — the markup
   * a server render whose catalog is not in yet emits with raw keys in it, and
   * the hydration render reads that same snapshot, so the gate only re-applies
   * afterwards on the client. To gate the server render too, pass
   * `ssrInitialIsInitializing={true}` alongside `fallback`: the server and the
   * hydration render both paint the fallback, and the children replace it once
   * the client host initializes. (`@comvi/next`'s provider passes `false` for
   * you, because its server render already has the catalog, so a `fallback`
   * there is a post-hydration gate only.)
   *
   * `undefined` is the same as omitting it; for a blank gate pass `false`.
   *
   * @example
   * ```tsx
   * <I18nProvider i18n={i18n} fallback={<Spinner />}>
   *   <App />
   * </I18nProvider>
   * ```
   */
  fallback?: React.ReactNode;
  /**
   * Render locale for the server snapshot, under the cross-binding name
   * `@comvi/vue` and `@comvi/nuxt` also use.
   */
  ssrLocale?: string;
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
 * const i18n = createI18n({ locale: 'en', messages: {...} });
 * <I18nProvider i18n={i18n}><App /></I18nProvider>
 * ```
 */
export function I18nProvider({
  children,
  i18n,
  autoInit = true,
  fallback,
  ssrLocale,
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
    () => ssrLocale ?? i18n.locale,
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
  // The `fallback` gate's axis. Same host field `useI18n().isInitialized`
  // reads and the same subscription the two above use — `initialized` is in
  // it, and that is the event that flips this. On the server it is the
  // negation of the initializing snapshot, so the SSR contract is unchanged:
  // `ssrInitialIsInitializing: false` (the default) means "ready, render the
  // children".
  const isInitialized = useSyncExternalStore(
    subLoading,
    () => i18n.isInitialized,
    () => !ssrInitialIsInitializing,
  );

  const instanceValue = useMemo<I18nInstanceContextValue>(
    () => ({ i18n, isLoading, isInitializing }),
    [i18n, isLoading, isInitializing],
  );

  // Both branches sit inside the providers, so the fallback may use the hooks.
  const gated = fallback !== undefined && !isInitialized;

  return (
    <I18nInstanceContext.Provider value={instanceValue}>
      <LocaleContext.Provider value={locale}>{gated ? fallback : children}</LocaleContext.Provider>
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
 * The host the nearest `<I18nProvider>` holds, as a bare `WrapperI18nHost` —
 * THE name for "give me the host", the same in react, solid and svelte (vue's
 * equivalent is `inject(I18N_INJECTION_KEY).core`). Not reactive on its own:
 * pair it with `useI18n()` or a selector hook to re-render.
 *
 * @throws if called outside an `<I18nProvider>`.
 */
export function useI18nHost(): WrapperI18nHost {
  return useI18nInstance().i18n;
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

export function useIsLoading(): { isLoading: boolean; isInitializing: boolean } {
  const { isLoading, isInitializing } = useI18nInstance();
  return { isLoading, isInitializing };
}
