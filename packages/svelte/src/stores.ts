import { readable, type Readable } from "svelte/store";
import { subscribeToRevision } from "@comvi/core";
import type { WrapperI18nHost, DefaultTranslationParams, DefaultParamsSnapshot } from "@comvi/core";

type Host<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D>;

/**
 * One store set per instance, so repeated `useI18n()` / `<T>` calls do not
 * build duplicates.
 *
 * Keyed by object IDENTITY, not by a host type: `WrapperI18nHost<D>` is
 * INVARIANT in `D` (`init(): Promise<this>` recurses back through the
 * `D`-typed `setDefaultParams`), so there is no single host type every host
 * widens to. Nothing here reads `D` — every store below is `D`-free or
 * `D`-erased, and `createDefaultParamsStore` re-applies the caller's `D` on
 * the way out.
 */
const storeCache = new WeakMap<
  object,
  {
    locale: Readable<string>;
    loading: Readable<boolean>;
    initializing: Readable<boolean>;
    initialized: Readable<boolean>;
    cacheRevision: Readable<number>;
    defaultParams: Readable<Readonly<DefaultTranslationParams> | undefined>;
  }
>();

function getOrCreateStores<D extends DefaultTranslationParams>(i18n: Host<D>) {
  let stores = storeCache.get(i18n);

  if (!stores) {
    stores = {
      locale: readable(i18n.locale, (set) => {
        set(i18n.locale);
        const unsubscribe = i18n.on("localeChanged", ({ to }) => set(to));
        return unsubscribe;
      }),
      loading: readable(i18n.isLoading, (set) => {
        set(i18n.isLoading);
        const unsubscribe = i18n.on("loadingStateChanged", ({ isLoading }) => set(isLoading));
        return unsubscribe;
      }),
      initializing: readable(i18n.isInitializing, (set) => {
        set(i18n.isInitializing);
        const unsubscribe = i18n.on("loadingStateChanged", ({ isInitializing }) =>
          set(isInitializing),
        );
        return unsubscribe;
      }),
      initialized: readable(i18n.isInitialized, (set) => {
        const syncInitializedState = () => set(i18n.isInitialized);
        syncInitializedState();

        const unsubInitialized = i18n.on("initialized", syncInitializedState);
        const unsubDestroyed = i18n.on("destroyed", syncInitializedState);

        return () => {
          unsubInitialized();
          unsubDestroyed();
        };
      }),
      cacheRevision: readable(i18n.translationCache.getRevision(), (set) => {
        // ONE monotonic counter: summing a cache and a config revision let two
        // opposite steps collide and drop a re-render. Bumps on core's whole
        // canonical event set, the locale/loading axes included.
        let revision = 0;
        set(revision);
        return subscribeToRevision(i18n, () => set(++revision));
      }),
      defaultParams: readable<Readonly<DefaultTranslationParams> | undefined>(
        i18n.defaultParams,
        (set) => {
          const sync = () => set(i18n.defaultParams);
          sync();
          return i18n.on("configChanged", sync);
        },
      ),
    };
    storeCache.set(i18n, stores);
  }

  return stores;
}

/** Memoized per i18n instance. */
export function createLocaleStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Readable<string> {
  return getOrCreateStores(i18n).locale;
}

/** Memoized per i18n instance. */
export function createLoadingStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Readable<boolean> {
  return getOrCreateStores(i18n).loading;
}

/** Memoized per i18n instance. */
export function createInitializingStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Readable<boolean> {
  return getOrCreateStores(i18n).initializing;
}

/** True once initialization finishes successfully. Memoized per instance. */
export function createInitializedStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Readable<boolean> {
  return getOrCreateStores(i18n).initialized;
}

/**
 * Tracks translation cache/config changes as a monotonic revision counter.
 * Memoized per i18n instance.
 */
export function createCacheRevisionStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Readable<number> {
  return getOrCreateStores(i18n).cacheRevision;
}

/** Shallow snapshot of the instance-level interpolation defaults. */
export function createDefaultParamsStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Readable<DefaultParamsSnapshot<D>> {
  return getOrCreateStores(i18n).defaultParams as Readable<DefaultParamsSnapshot<D>>;
}
