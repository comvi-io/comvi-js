import { readable, type Readable } from "svelte/store";
import type { I18n } from "@comvi/core";

/**
 * Cache for memoized stores per i18n instance
 * Prevents creating duplicate stores when useI18n() or <T> is called multiple times
 */
const storeCache = new WeakMap<
  I18n,
  {
    language: Readable<string>;
    loading: Readable<boolean>;
    initializing: Readable<boolean>;
    initialized: Readable<boolean>;
    cacheRevision: Readable<number>;
  }
>();

/**
 * Get or create memoized stores for an i18n instance
 * Ensures only one set of stores exists per i18n instance
 */
function getOrCreateStores(i18n: I18n) {
  let stores = storeCache.get(i18n);

  if (!stores) {
    stores = {
      language: readable(i18n.locale, (set) => {
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
        set(i18n.translationCache.getRevision());
        const unsub1 = i18n.on("namespaceLoaded", () => set(i18n.translationCache.getRevision()));
        const unsub2 = i18n.on("initialized", () => set(i18n.translationCache.getRevision()));
        const unsub3 = i18n.on("translationsCleared", () =>
          set(i18n.translationCache.getRevision()),
        );

        return () => {
          unsub1();
          unsub2();
          unsub3();
        };
      }),
    };
    storeCache.set(i18n, stores);
  }

  return stores;
}

/**
 * Creates a Svelte store for the current language
 * Updates automatically when language changes
 * Memoized per i18n instance
 */
export function createLanguageStore(i18n: I18n): Readable<string> {
  return getOrCreateStores(i18n).language;
}

/**
 * Creates a Svelte store for the loading state
 * Updates when translations are being loaded
 * Memoized per i18n instance
 */
export function createLoadingStore(i18n: I18n): Readable<boolean> {
  return getOrCreateStores(i18n).loading;
}

/**
 * Creates a Svelte store for the initializing state
 * Updates during initialization
 * Memoized per i18n instance
 */
export function createInitializingStore(i18n: I18n): Readable<boolean> {
  return getOrCreateStores(i18n).initializing;
}

/**
 * Creates a Svelte store for the initialized state
 * Becomes true once initialization finishes successfully
 * Memoized per i18n instance
 */
export function createInitializedStore(i18n: I18n): Readable<boolean> {
  return getOrCreateStores(i18n).initialized;
}

/**
 * Creates a Svelte store that tracks translation cache changes
 * Uses revision counter for efficient O(1) change detection
 * Memoized per i18n instance
 */
export function createCacheRevisionStore(i18n: I18n): Readable<number> {
  return getOrCreateStores(i18n).cacheRevision;
}
