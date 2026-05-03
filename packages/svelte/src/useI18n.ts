import { derived, type Readable } from "svelte/store";
import { getI18nContext } from "./context";
import {
  createLanguageStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
} from "./stores";
import { translationResultToString } from "./utils";
import { createBoundTranslation } from "@comvi/core";
import type { I18n } from "@comvi/core";
import type {
  TranslationParams,
  TranslationResult,
  TranslationValue,
  FlattenedTranslations,
  I18nEvent,
  I18nEventData,
} from "@comvi/core";

const DEFAULT_NS_CACHE_KEY = Symbol("comvi-default-ns");
type TranslationStoreCacheKey = string | symbol;
type RawTranslationFunction = I18n["t"];
type TextTranslationFunction = (key: string, params?: TranslationParams) => string;
type RawTranslationStore = Readable<RawTranslationFunction>;
type TextTranslationStore = Readable<TextTranslationFunction>;

/**
 * Cache of derived raw translation stores per i18n instance and default namespace.
 * Keeps store references stable across repeated useI18n() calls.
 */
const rawTranslationStoreCache = new WeakMap<
  I18n,
  Map<TranslationStoreCacheKey, RawTranslationStore>
>();
const textTranslationStoreCache = new WeakMap<
  I18n,
  Map<TranslationStoreCacheKey, TextTranslationStore>
>();

function getOrCreateRawTranslationStore(i18n: I18n, ns?: string): RawTranslationStore {
  let storesByNamespace = rawTranslationStoreCache.get(i18n);

  if (!storesByNamespace) {
    storesByNamespace = new Map<TranslationStoreCacheKey, RawTranslationStore>();
    rawTranslationStoreCache.set(i18n, storesByNamespace);
  }

  const cacheKey: TranslationStoreCacheKey = ns ?? DEFAULT_NS_CACHE_KEY;
  const existingStore = storesByNamespace.get(cacheKey);
  if (existingStore) {
    return existingStore;
  }

  const locale = createLanguageStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);
  const tRawStore = derived([locale, cacheRevision], () =>
    createBoundTranslation(i18n, ns),
  ) as unknown as RawTranslationStore;

  storesByNamespace.set(cacheKey, tRawStore);
  return tRawStore;
}

function getOrCreateTextTranslationStore(i18n: I18n, ns?: string): TextTranslationStore {
  let storesByNamespace = textTranslationStoreCache.get(i18n);

  if (!storesByNamespace) {
    storesByNamespace = new Map<TranslationStoreCacheKey, TextTranslationStore>();
    textTranslationStoreCache.set(i18n, storesByNamespace);
  }

  const cacheKey: TranslationStoreCacheKey = ns ?? DEFAULT_NS_CACHE_KEY;
  const existingStore = storesByNamespace.get(cacheKey);
  if (existingStore) {
    return existingStore;
  }

  const tRawStore = getOrCreateRawTranslationStore(i18n, ns);
  const tStore = derived(
    tRawStore,
    ($tRaw) => (key: string, params?: TranslationParams) =>
      translationResultToString($tRaw(key as never, params as never)),
  ) as TextTranslationStore;

  storesByNamespace.set(cacheKey, tStore);
  return tStore;
}

export interface UseI18nReturn {
  /**
   * Reactive translation function store
   * Subscribe to get the translation function that updates when language/cache changes
   *
   * @example
   * ```svelte
   * <script>
   *   const { t } = useI18n();
   * </script>
   *
   * <p>{$t('greeting')}</p>
   * ```
   */
  t: Readable<TextTranslationFunction>;

  /**
   * Reactive raw translation function store
   * Returns structured TranslationResult for advanced integrations.
   */
  tRaw: Readable<RawTranslationFunction>;

  /** Current locale as a readable store */
  locale: Readable<string>;

  /** Loading state as a readable store */
  isLoading: Readable<boolean>;

  /** Initializing state as a readable store */
  isInitializing: Readable<boolean>;

  /** Initialized state as a readable store */
  isInitialized: Readable<boolean>;

  /** Translation cache revision (for triggering reactivity) */
  cacheRevision: Readable<number>;

  // ===== Critical Methods =====

  /** Change the current locale and wait for translations to load */
  setLocale: I18n["setLocaleAsync"];

  /** Add translations programmatically at runtime */
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  /** Load a new namespace dynamically */
  addActiveNamespace: (namespace: string) => Promise<void>;

  // ===== Advanced Methods =====

  /** Configure fallback locale chain */
  setFallbackLocale: (locales: string | string[]) => void;

  /** Register callback for missing keys */
  onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ) => () => void;

  /** Register callback for load errors */
  onLoadError: (callback: (locale: string, namespace: string, error: Error) => void) => () => void;

  /** Clear translations from cache */
  clearTranslations: (locale?: string, namespace?: string) => void;

  /** Force reload translations from loader */
  reloadTranslations: (locale?: string, namespace?: string) => Promise<void>;

  // ===== Informational Methods =====

  /** Check if a locale is loaded for a namespace */
  hasLocale: (locale: string, namespace?: string) => boolean;

  /** Check if a translation exists */
  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;

  /** Get list of all loaded locales */
  getLoadedLocales: () => string[];

  /** Get list of active namespaces */
  getActiveNamespaces: () => string[];

  /** Get default namespace */
  getDefaultNamespace: () => string;

  /** Get direct access to translation cache */
  getTranslationCache: () => ReadonlyMap<string, FlattenedTranslations>;

  // ===== Event Subscription =====

  /**
   * Subscribe to i18n events
   * Provides direct access to core event system for advanced use cases
   */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;

  /** Report an error to the configured onError handler */
  reportError: I18n["reportError"];

  // ===== Formatting =====

  /** Format a number using the current language locale */
  formatNumber: I18n["formatNumber"];

  /** Format a date using the current language locale */
  formatDate: I18n["formatDate"];

  /** Format a number as currency using the current language locale */
  formatCurrency: I18n["formatCurrency"];

  /** Format a relative time ("2 hours ago", "in 3 days") using the current language locale */
  formatRelativeTime: I18n["formatRelativeTime"];

  /** Text direction for the current language as a readable store */
  dir: Readable<"ltr" | "rtl">;
}

/**
 * Hook to access i18n functionality in Svelte components
 * Must be used within a component that has i18n context set
 *
 * @param ns - Optional namespace to scope translations to
 * @returns Object with reactive stores and i18n methods
 *
 * @example Basic usage
 * ```svelte
 * <script>
 *   import { useI18n } from '@comvi/svelte';
 *
 *   const { t, locale, setLocale } = useI18n();
 * </script>
 *
 * <p>{$t('greeting')}</p>
 * <p>Current locale: {$locale}</p>
 * <button on:click={() => setLocale('fr')}>Switch to French</button>
 * ```
 *
 * @example With parameters
 * ```svelte
 * <script>
 *   import { useI18n } from '@comvi/svelte';
 *
 *   const { t } = useI18n();
 *   let count = 5;
 * </script>
 *
 * <p>{$t('items', { count })}</p>
 * ```
 *
 * @example Dynamic namespace loading
 * ```svelte
 * <script>
 *   import { useI18n } from '@comvi/svelte';
 *
 *   const { t, addActiveNamespace, isLoading } = useI18n();
 *   let isAdminLoaded = false;
 *
 *   async function loadAdmin() {
 *     await addActiveNamespace('admin');
 *     isAdminLoaded = true;
 *   }
 * </script>
 *
 * {#if $isLoading}
 *   <p>Loading...</p>
 * {:else if isAdminLoaded}
 *   <p>{$t('dashboard', { ns: 'admin' })}</p>
 * {:else}
 *   <button on:click={loadAdmin}>Load Admin</button>
 * {/if}
 * ```
 */
export function useI18n(ns?: string): UseI18nReturn {
  const i18n = getI18nContext();

  // Create reactive stores
  const locale = createLanguageStore(i18n);
  const isLoading = createLoadingStore(i18n);
  const isInitializing = createInitializingStore(i18n);
  const isInitialized = createInitializedStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);

  // Create or reuse derived translation stores for this i18n + namespace scope.
  // The derived function still re-computes on locale/cache changes.
  const tRaw = getOrCreateRawTranslationStore(i18n, ns);
  const t = getOrCreateTextTranslationStore(i18n, ns);

  return {
    t,
    tRaw,
    locale,
    isLoading,
    isInitializing,
    isInitialized,
    cacheRevision,

    // Methods bound to i18n instance
    setLocale: i18n.setLocaleAsync.bind(i18n),
    addTranslations: i18n.addTranslations.bind(i18n),
    addActiveNamespace: i18n.addActiveNamespace.bind(i18n),
    setFallbackLocale: i18n.setFallbackLocale.bind(i18n),
    onMissingKey: i18n.onMissingKey.bind(i18n),
    onLoadError: i18n.onLoadError.bind(i18n),
    clearTranslations: i18n.clearTranslations.bind(i18n),
    reloadTranslations: i18n.reloadTranslations.bind(i18n),
    hasLocale: i18n.hasLocale.bind(i18n),
    hasTranslation: i18n.hasTranslation.bind(i18n),
    getLoadedLocales: i18n.getLoadedLocales.bind(i18n),
    getActiveNamespaces: i18n.getActiveNamespaces.bind(i18n),
    getDefaultNamespace: i18n.getDefaultNamespace.bind(i18n),
    getTranslationCache: () => i18n.translationCache.getInternalMap(),
    on: i18n.on.bind(i18n),
    reportError: i18n.reportError.bind(i18n),
    formatNumber: i18n.formatNumber.bind(i18n),
    formatDate: i18n.formatDate.bind(i18n),
    formatCurrency: i18n.formatCurrency.bind(i18n),
    formatRelativeTime: i18n.formatRelativeTime.bind(i18n),
    // Derived store that recomputes when locale changes — reads i18n.dir,
    // which is kept in sync with the reactive locale by core's localeChanged event
    dir: derived(locale, () => i18n.dir),
  };
}
