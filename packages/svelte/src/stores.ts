import { readable, writable, type Readable, type Writable } from "svelte/store";
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
    defaultParams: Writable<Readonly<DefaultTranslationParams> | undefined>;
    defaultNamespace: Writable<string>;
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
      cacheRevision: readable(0, (set) => {
        // ONE monotonic counter: summing a cache and a config revision let two
        // opposite steps collide and drop a re-render.
        //
        // Core's canonical revision event set MINUS the locale/loading axes,
        // which have their own stores here — bumping on those would break the
        // pinned-locale contract that `<T locale="…">` does not recompute when
        // the global locale changes.
        let revision = 0;
        set(revision);
        return subscribeToRevision(i18n, (event) => {
          if (event !== "localeChanged" && event !== "loadingStateChanged") {
            set(++revision);
          }
        });
      }),
      // Writable for the same reason `defaultNamespace` below is: the host
      // stays the source of truth — `set` writes THROUGH to
      // `setDefaultParams`, it does not assign the local value — so the axis
      // solid can write through `createDefaultParamsState`'s setter is
      // writable here too.
      defaultParams: (() => {
        const { subscribe } = readable<Readonly<DefaultTranslationParams> | undefined>(
          i18n.defaultParams,
          (set) => {
            const sync = () => set(i18n.defaultParams);
            sync();
            return i18n.on("configChanged", sync);
          },
        );
        return {
          subscribe,
          set: (value: Readonly<DefaultTranslationParams> | undefined) =>
            i18n.setDefaultParams(value as never),
          update: (
            updater: (
              value: Readonly<DefaultTranslationParams> | undefined,
            ) => Readonly<DefaultTranslationParams> | undefined,
          ) => i18n.setDefaultParams(updater(i18n.defaultParams) as never),
        };
      })(),
      // Writable, not readable: the host is still the source of truth (`set`
      // writes THROUGH to `setDefaultNamespace`, it does not assign the local
      // value directly), but callers may assign into this one. Solid's
      // counterpart on this axis is `createDefaultNamespaceState`, which
      // returns `[accessor, setter]`; its read-only `createDefaultNamespaceSignal`
      // is the accessor half alone.
      defaultNamespace: (() => {
        const { subscribe } = writable(i18n.getDefaultNamespace(), (set) => {
          set(i18n.getDefaultNamespace());
          return i18n.on("defaultNamespaceChanged", ({ to }) => set(to));
        });
        return {
          subscribe,
          set: (value: string) => i18n.setDefaultNamespace(value),
          update: (updater: (value: string) => string) =>
            i18n.setDefaultNamespace(updater(i18n.getDefaultNamespace())),
        };
      })(),
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

/**
 * Shallow snapshot of the instance-level interpolation defaults, writable:
 * `store.set({ … })` / `$store = { … }` calls `setDefaultParams`, it does not
 * shadow the host's own value, and `undefined` clears them. Memoized per i18n
 * instance. The solid counterpart is
 * `solid/src/primitives.ts:createDefaultParamsState`, which returns the setter
 * beside the accessor instead (its `create*Signal` half reads only).
 */
export function createDefaultParamsStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Writable<DefaultParamsSnapshot<D>> {
  return getOrCreateStores(i18n).defaultParams as Writable<DefaultParamsSnapshot<D>>;
}

/**
 * The default namespace, writable: assigning into it (`$store = "admin"` or
 * `store.set("admin")`) writes through to `setDefaultNamespace`, it does not
 * shadow the host's own value. Memoized per i18n instance. The solid
 * counterpart is `solid/src/primitives.ts:createDefaultNamespaceState`, which
 * returns the same axis as a signal + setter tuple.
 */
export function createDefaultNamespaceStore<D extends DefaultTranslationParams = {}>(
  i18n: Host<D>,
): Writable<string> {
  return getOrCreateStores(i18n).defaultNamespace;
}
