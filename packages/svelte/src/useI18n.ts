import { derived, type Readable } from "svelte/store";
import { getI18nContext } from "./context";
import {
  createLocaleStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
  createDefaultParamsStore,
} from "./stores";
import { translationResultToString } from "./utils";
import {
  createBoundTranslation,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
} from "@comvi/core";
import type { I18n } from "@comvi/core";
import type {
  TranslationParams,
  TranslationResult,
  TranslationValue,
  FlattenedTranslations,
  I18nEvent,
  I18nEventData,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
  Namespaces,
  NamespacedKeys,
  NamespacedParamsArg,
  DefaultNsKeys,
  ParamsArg,
  PermissiveKey,
} from "@comvi/core";

const DEFAULT_NS_CACHE_KEY = Symbol("comvi-default-ns");
type TranslationStoreCacheKey = string | symbol;
export interface SvelteTextTranslationFunction<D extends DefaultTranslationParams = {}> {
  <NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K, D>
  ): string;
  <K extends DefaultNsKeys>(key: K, ...params: ParamsArg<K, D>): string;
  (key: PermissiveKey, params?: TranslationParams): string;
}

export interface SvelteRawTranslationFunction<D extends DefaultTranslationParams = {}> {
  <NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K, D>
  ): TranslationResult;
  <K extends DefaultNsKeys>(key: K, ...params: ParamsArg<K, D>): TranslationResult;
  (key: PermissiveKey, params?: TranslationParams): TranslationResult;
}

type RawTranslationStore<D extends DefaultTranslationParams> = Readable<
  SvelteRawTranslationFunction<D>
>;
type TextTranslationStore<D extends DefaultTranslationParams> = Readable<
  SvelteTextTranslationFunction<D>
>;
type CachedRawTranslationStore = RawTranslationStore<{}>;
type CachedTextTranslationStore = TextTranslationStore<{}>;

/**
 * Cache of derived raw translation stores per i18n instance and default namespace.
 * Keeps store references stable across repeated useI18n() calls.
 */
const rawTranslationStoreCache = new WeakMap<
  I18n,
  Map<TranslationStoreCacheKey, CachedRawTranslationStore>
>();
const textTranslationStoreCache = new WeakMap<
  I18n,
  Map<TranslationStoreCacheKey, CachedTextTranslationStore>
>();

function getOrCreateRawTranslationStore<D extends DefaultTranslationParams>(
  i18n: I18n<D>,
  ns?: string,
): RawTranslationStore<D> {
  let storesByNamespace = rawTranslationStoreCache.get(i18n);

  if (!storesByNamespace) {
    storesByNamespace = new Map<TranslationStoreCacheKey, CachedRawTranslationStore>();
    rawTranslationStoreCache.set(i18n, storesByNamespace);
  }

  const cacheKey: TranslationStoreCacheKey = ns ?? DEFAULT_NS_CACHE_KEY;
  const existingStore = storesByNamespace.get(cacheKey);
  if (existingStore) {
    return existingStore as unknown as RawTranslationStore<D>;
  }

  const locale = createLocaleStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);
  const tRawStore = derived([locale, cacheRevision], () =>
    createBoundTranslation(i18n, ns),
  ) as unknown as RawTranslationStore<D>;

  storesByNamespace.set(cacheKey, tRawStore as unknown as CachedRawTranslationStore);
  return tRawStore;
}

function getOrCreateTextTranslationStore<D extends DefaultTranslationParams>(
  i18n: I18n<D>,
  ns?: string,
): TextTranslationStore<D> {
  let storesByNamespace = textTranslationStoreCache.get(i18n);

  if (!storesByNamespace) {
    storesByNamespace = new Map<TranslationStoreCacheKey, CachedTextTranslationStore>();
    textTranslationStoreCache.set(i18n, storesByNamespace);
  }

  const cacheKey: TranslationStoreCacheKey = ns ?? DEFAULT_NS_CACHE_KEY;
  const existingStore = storesByNamespace.get(cacheKey);
  if (existingStore) {
    return existingStore as unknown as TextTranslationStore<D>;
  }

  const tRawStore = getOrCreateRawTranslationStore(i18n, ns);
  const tStore = derived(
    tRawStore,
    ($tRaw) => (key: string, params?: TranslationParams) =>
      translationResultToString($tRaw(key as never, params as never)),
  ) as unknown as TextTranslationStore<D>;

  storesByNamespace.set(cacheKey, tStore as unknown as CachedTextTranslationStore);
  return tStore;
}

export interface UseI18nReturn<D extends DefaultTranslationParams = {}> {
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
  t: Readable<SvelteTextTranslationFunction<D>>;

  /**
   * Reactive raw translation function store
   * Returns structured TranslationResult for advanced integrations.
   */
  tRaw: Readable<SvelteRawTranslationFunction<D>>;

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

  /** Reactive shallow snapshot of instance-level interpolation defaults. */
  defaultParams: Readable<DefaultParamsSnapshot<D>>;

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

  /** Replace instance-level interpolation defaults. */
  setDefaultParams: I18n<D>["setDefaultParams"];

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

  /** Format a number using the current locale */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions, locale?: string) => string;

  /** Format a date using the current locale */
  formatDate: (
    value: Date | number,
    options?: Intl.DateTimeFormatOptions,
    locale?: string,
  ) => string;

  /** Format a number as currency using the current locale */
  formatCurrency: (
    value: number,
    currency: string,
    options?: Intl.NumberFormatOptions,
    locale?: string,
  ) => string;

  /** Format a relative time ("2 hours ago", "in 3 days") using the current locale */
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
    locale?: string,
  ) => string;

  /** Text direction for the current locale as a readable store */
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
 * <button onclick={() => setLocale('fr')}>Switch to French</button>
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
 *   <button onclick={loadAdmin}>Load Admin</button>
 * {/if}
 * ```
 */
export function useI18n<D extends DefaultTranslationParams = {}>(ns?: string): UseI18nReturn<D> {
  const i18n = getI18nContext() as I18n<D>;

  // Create reactive stores
  const locale = createLocaleStore(i18n);
  const isLoading = createLoadingStore(i18n);
  const isInitializing = createInitializingStore(i18n);
  const isInitialized = createInitializedStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);
  const defaultParams = createDefaultParamsStore(i18n);

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
    defaultParams,

    // Methods bound to i18n instance
    setLocale: i18n.setLocaleAsync.bind(i18n),
    addTranslations: i18n.addTranslations.bind(i18n),
    addActiveNamespace: i18n.addActiveNamespace.bind(i18n),
    setFallbackLocale: i18n.setFallbackLocale.bind(i18n),
    setDefaultParams: i18n.setDefaultParams.bind(i18n) as I18n<D>["setDefaultParams"],
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
    formatNumber: (value, options, loc) => formatNumber(i18n, value, options, loc),
    formatDate: (value, options, loc) => formatDate(i18n, value, options, loc),
    formatCurrency: (value, currency, options, loc) =>
      formatCurrency(i18n, value, currency, options, loc),
    formatRelativeTime: (value, unit, options, loc) =>
      formatRelativeTime(i18n, value, unit, options, loc),
    // Derived store that recomputes when locale changes
    dir: derived(locale, ($locale) => getTextDirection($locale)),
  };
}
