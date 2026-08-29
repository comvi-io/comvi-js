import { derived, type Readable } from "svelte/store";
import { getI18nContext } from "./context.js";
import {
  createLocaleStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
  createDefaultParamsStore,
} from "./stores.js";
import {
  createBoundTranslation,
  translationResultToString,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
} from "@comvi/core";
import type {
  WrapperI18nHost,
  TranslationParams,
  TranslationResult,
  TranslationValue,
  TranslateFn,
  FlattenedTranslations,
  I18nEvent,
  I18nEventData,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
} from "@comvi/core";

/** Loader/plugin-host members are NOT part of it — see `capabilities.ts`. */
type Host<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D>;

const DEFAULT_NS_CACHE_KEY = Symbol("comvi-default-ns");
type TranslationStoreCacheKey = string | symbol;
export type SvelteTextTranslationFunction<D extends DefaultTranslationParams = {}> = TranslateFn<
  D,
  string
>;
export type SvelteRawTranslationFunction<D extends DefaultTranslationParams = {}> = TranslateFn<
  D,
  TranslationResult
>;

type RawTranslationStore<D extends DefaultTranslationParams> = Readable<
  SvelteRawTranslationFunction<D>
>;
type TextTranslationStore<D extends DefaultTranslationParams> = Readable<
  SvelteTextTranslationFunction<D>
>;
type CachedRawTranslationStore = RawTranslationStore<{}>;
type CachedTextTranslationStore = TextTranslationStore<{}>;

/**
 * One derived store per (instance, namespace), so repeated `useI18n()` calls
 * get stable store references.
 *
 * Keyed by object IDENTITY: `WrapperI18nHost<D>` is INVARIANT in `D`
 * (`init(): Promise<this>` recurses back through the `D`-typed
 * `setDefaultParams`), so there is no host type every host widens to. The
 * cached stores are `D`-erased and re-typed per caller on the way out.
 */
const rawTranslationStoreCache = new WeakMap<
  object,
  Map<TranslationStoreCacheKey, CachedRawTranslationStore>
>();
const textTranslationStoreCache = new WeakMap<
  object,
  Map<TranslationStoreCacheKey, CachedTextTranslationStore>
>();

function getOrCreateRawTranslationStore<D extends DefaultTranslationParams>(
  i18n: Host<D>,
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
  i18n: Host<D>,
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

/**
 * The host-only translation surface. Loader and plugin-host members are not
 * part of it — they do not exist on a base host, and svelte is the wrapper
 * where promising them crashed EAGERLY: `useI18n()` `.bind()`s its members at
 * call time, so a base host threw before returning anything.
 */
export interface UseI18nReturn<D extends DefaultTranslationParams = {}> {
  /**
   * A STORE of the translation function — `$`-prefix it at the call site.
   *
   * @example
   * ```svelte
   * <p>{$t('greeting')}</p>
   * ```
   */
  t: Readable<SvelteTextTranslationFunction<D>>;

  /** The rich-text half: a store of a function returning `TranslationResult`. */
  tRaw: Readable<SvelteRawTranslationFunction<D>>;

  locale: Readable<string>;

  isLoading: Readable<boolean>;

  isInitializing: Readable<boolean>;

  isInitialized: Readable<boolean>;

  /** Monotonic; subscribe to depend on cache and config changes. */
  cacheRevision: Readable<number>;

  /** Shallow snapshot of instance-level interpolation defaults. */
  defaultParams: Readable<DefaultParamsSnapshot<D>>;

  /** Resolves once translations for the new locale have loaded. */
  setLocale: Host["setLocaleAsync"];

  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  setFallbackLocale: (locales: string | string[]) => void;

  /** Replace instance-level interpolation defaults. */
  setDefaultParams: Host<D>["setDefaultParams"];

  clearTranslations: (locale?: string, namespace?: string) => void;

  hasLocale: (locale: string, namespace?: string) => boolean;

  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;

  getLoadedLocales: () => string[];

  getActiveNamespaces: () => string[];

  getDefaultNamespace: () => string;

  getTranslationCache: () => ReadonlyMap<string, FlattenedTranslations>;

  /** Returns an unsubscribe function. */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;

  /** Routes to the configured `onError` handler. */
  reportError: Host["reportError"];

  // The formatters below are plain functions, not stores.
  formatNumber: (value: number, options?: Intl.NumberFormatOptions, locale?: string) => string;

  formatDate: (
    value: Date | number,
    options?: Intl.DateTimeFormatOptions,
    locale?: string,
  ) => string;

  formatCurrency: (
    value: number,
    currency: string,
    options?: Intl.NumberFormatOptions,
    locale?: string,
  ) => string;

  /** e.g. "2 hours ago", "in 3 days". */
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
    locale?: string,
  ) => string;

  dir: Readable<"ltr" | "rtl">;
}

/**
 * Call during component initialisation, under a `setI18nContext` ancestor.
 *
 * @param ns - Scopes `t` / `tRaw` so key lookups default to this namespace.
 *
 * @example
 * ```svelte
 * <script>
 *   const { t, locale, setLocale } = useI18n();
 * </script>
 *
 * <p>{$t('greeting')} ({$locale})</p>
 * <button onclick={() => setLocale('fr')}>Français</button>
 * ```
 */
export function useI18n<D extends DefaultTranslationParams = {}>(ns?: string): UseI18nReturn<D> {
  // Svelte context is type-erased — one fixed key — so `D` can only come from
  // the call site, and `WrapperI18nHost<D>` is invariant in `D`: hence the
  // two-step assertion.
  const i18n = getI18nContext() as unknown as Host<D>;

  const locale = createLocaleStore(i18n);
  const isLoading = createLoadingStore(i18n);
  const isInitializing = createInitializingStore(i18n);
  const isInitialized = createInitializedStore(i18n);
  const cacheRevision = createCacheRevisionStore(i18n);
  const defaultParams = createDefaultParamsStore(i18n);

  // Reused per (instance, namespace); the derived function still re-computes
  // on locale and cache changes.
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

    // `addActiveNamespace`, `reloadTranslations`, `onLoadError` and
    // `onMissingKey` are NOT here: they belong to capabilities a base host does
    // not have, and `.bind()` on an absent member throws EAGERLY — this very
    // object literal used to crash `useI18n()` on such a host.
    // `useI18nLoader()` / `useI18nPlugins()` acquire them instead, throwing one
    // named error at the acquisition point.
    setLocale: i18n.setLocaleAsync.bind(i18n),
    addTranslations: i18n.addTranslations.bind(i18n),
    setFallbackLocale: i18n.setFallbackLocale.bind(i18n),
    setDefaultParams: i18n.setDefaultParams.bind(i18n) as Host<D>["setDefaultParams"],
    clearTranslations: i18n.clearTranslations.bind(i18n),
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
    dir: derived(locale, ($locale) => getTextDirection($locale)),
  };
}
