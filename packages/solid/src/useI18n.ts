import { type Accessor } from "solid-js";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
  translationResultToString,
} from "@comvi/core/slim";
import { useI18nContextValue } from "./context";
import type {
  WrapperI18nHost,
  TranslationParams,
  TranslationResult,
  TranslationKeys,
  TranslateFn,
  Namespaces,
  NamespacedKeys,
  ParamsArg,
  FlattenedTranslations,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
} from "@comvi/core";

/**
 * Host type every solid binding demands (framework-slim D′): the reactive
 * translation host, exactly what a bare `@comvi/core/slim` instance
 * implements. The loader/plugin-host members are deliberately NOT part of it —
 * they are acquired through `useI18nLoader()` / `useI18nPlugins()`.
 */
type Host<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D>;

type BoundDefaultNamespaceParams<
  NS extends string,
  K extends string,
  D extends DefaultTranslationParams,
> = `${NS}:${K}` extends keyof TranslationKeys
  ? ParamsArg<`${NS}:${K}` & keyof TranslationKeys, D>
  : [params?: TranslationParams];

type BoundNamespaceShorthand<
  DefaultNS extends string | undefined,
  D extends DefaultTranslationParams,
  R,
> = DefaultNS extends Namespaces
  ? {
      /**
       * Namespace-bound shorthand when useI18n(ns) is provided.
       * Allows `t('title')` instead of `t('title', { ns: 'admin' })`.
       */
      <K extends NamespacedKeys<DefaultNS>>(
        key: K,
        ...params: BoundDefaultNamespaceParams<DefaultNS, K, D>
      ): R;
    }
  : {};

type UseI18nTranslation<
  DefaultNS extends string | undefined,
  D extends DefaultTranslationParams,
> = TranslateFn<D, string> & BoundNamespaceShorthand<DefaultNS, D, string>;

type UseI18nRawTranslation<
  DefaultNS extends string | undefined,
  D extends DefaultTranslationParams,
> = TranslateFn<D, TranslationResult> & BoundNamespaceShorthand<DefaultNS, D, TranslationResult>;

/**
 * The host-only translation surface. The four capability members that used to
 * live here — `addActiveNamespace`, `reloadTranslations`, `onLoadError`
 * (loader) and `onMissingKey` (plugins) — moved to `useI18nLoader()` /
 * `useI18nPlugins()` in 0.5.0: they do not exist on a bare-slim host, so a
 * type that promised them was lying (plan §2.4).
 */
export interface UseI18nReturn<
  DefaultNS extends string | undefined = undefined,
  D extends DefaultTranslationParams = {},
> {
  /**
   * Reactive translation function
   * Automatically re-renders when language or translations change
   * Always returns plain text.
   *
   * @example
   * ```tsx
   * const { t } = useI18n();
   *
   * // Use directly in JSX - no double call needed!
   * <p>{t('greeting')}</p>
   * <p>{t('welcome', { name: 'Alice' })}</p>
   * ```
   */
  t: UseI18nTranslation<DefaultNS, D>;

  /**
   * Raw translation function returning full core TranslationResult.
   * Use for advanced scenarios that need structured output.
   */
  tRaw: UseI18nRawTranslation<DefaultNS, D>;

  /** Current locale as a reactive accessor */
  locale: Accessor<string>;

  /** Loading state as a reactive accessor */
  isLoading: Accessor<boolean>;

  /** Initializing state as a reactive accessor */
  isInitializing: Accessor<boolean>;

  /** Initialized state as a reactive accessor */
  isInitialized: Accessor<boolean>;

  /** Translation cache revision (for triggering reactivity) */
  cacheRevision: Accessor<number>;

  /** Reactive shallow snapshot of instance-level interpolation defaults. */
  defaultParams: Accessor<DefaultParamsSnapshot<D>>;

  // ===== Critical Methods =====

  /** Change the current locale and wait for translations to load */
  setLocale: Host["setLocaleAsync"];

  /** Add translations programmatically at runtime */
  addTranslations: Host["addTranslations"];

  // ===== Advanced Methods =====

  /** Configure fallback locale chain */
  setFallbackLocale: Host["setFallbackLocale"];

  /** Replace instance-level interpolation defaults. */
  setDefaultParams: Host<D>["setDefaultParams"];

  /** Clear translations from cache */
  clearTranslations: Host["clearTranslations"];

  // ===== Informational Methods =====

  /** Check if a locale is loaded for a namespace */
  hasLocale: Host["hasLocale"];

  /** Check if a translation exists */
  hasTranslation: Host["hasTranslation"];

  /** Get list of all loaded locales */
  getLoadedLocales: () => string[];

  /** Get list of active namespaces */
  getActiveNamespaces: Host["getActiveNamespaces"];

  /** Get default namespace */
  getDefaultNamespace: Host["getDefaultNamespace"];

  /** Get direct access to translation cache */
  getTranslationCache: () => ReadonlyMap<string, FlattenedTranslations>;

  // ===== Event Subscription =====

  /**
   * Subscribe to i18n events
   * Provides direct access to core event system for advanced use cases
   */
  on: Host["on"];

  /** Report an error to the configured onError handler */
  reportError: Host["reportError"];

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

  /** Text direction for the current locale as a reactive accessor */
  dir: () => "ltr" | "rtl";
}

/**
 * Hook to access i18n functionality in SolidJS components
 * Must be used within a component wrapped by I18nProvider
 *
 * @param ns - Optional namespace to scope translations to
 * @returns Object with reactive translation function and i18n methods
 *
 * @example Basic usage
 * ```tsx
 * import { useI18n } from '@comvi/solid';
 *
 * function Greeting() {
 *   const { t, locale, setLocale } = useI18n();
 *
 *   return (
 *     <div>
 *       <p>{t('greeting')}</p>
 *       <p>Current locale: {locale()}</p>
 *       <button onClick={() => setLocale('fr')}>Switch to French</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example With parameters
 * ```tsx
 * import { useI18n } from '@comvi/solid';
 * import { createSignal } from 'solid-js';
 *
 * function Counter() {
 *   const { t } = useI18n();
 *   const [count, setCount] = createSignal(5);
 *
 *   return <p>{t('items', { count: count() })}</p>;
 * }
 * ```
 *
 * @example Dynamic namespace loading
 * ```tsx
 * import { useI18n } from '@comvi/solid';
 * import { createSignal } from 'solid-js';
 *
 * function AdminPanel() {
 *   const { t, addActiveNamespace, isLoading } = useI18n();
 *   const [isAdminLoaded, setIsAdminLoaded] = createSignal(false);
 *
 *   async function loadAdmin() {
 *     await addActiveNamespace('admin');
 *     setIsAdminLoaded(true);
 *   }
 *
 *   return (
 *     <Show when={!isLoading()} fallback={<p>Loading...</p>}>
 *       <Show when={isAdminLoaded()} fallback={<button onClick={loadAdmin}>Load Admin</button>}>
 *         <p>{t('dashboard', { ns: 'admin' })}</p>
 *       </Show>
 *     </Show>
 *   );
 * }
 * ```
 */
export function useI18n<
  DefaultNS extends string | undefined = undefined,
  D extends DefaultTranslationParams = {},
>(ns?: DefaultNS): UseI18nReturn<DefaultNS, D> {
  const ctx = useI18nContextValue();

  /**
   * Reactive raw translation function.
   * When called within a reactive context (JSX, createMemo, createEffect),
   * it automatically tracks language and cache changes.
   */
  const tRaw = ((key: string, params?: TranslationParams): TranslationResult => {
    // Access signals to establish reactive dependencies.
    // This works because SolidJS tracks signal access in reactive contexts.
    // Only subscribe to the global locale when the caller didn't pin one
    // explicitly — tRaw(key, { locale }) does not depend on the active locale,
    // so tracking it would cause needless recomputes on global locale changes.
    if (params?.locale === undefined) {
      ctx.signals.locale();
    }
    ctx.signals.cacheRevision();
    if (ns === undefined) {
      ctx.signals.defaultNamespace();
    }

    // No params: preserve core fast-path and avoid unnecessary object allocation.
    if (params == null) {
      if (ns === undefined) {
        return ctx.i18n.tRaw(key as never);
      }
      return ctx.i18n.tRaw(key as never, { ns } as TranslationParams);
    }

    // User explicitly provided namespace - never override it.
    if (params.ns !== undefined || ns === undefined) {
      return ctx.i18n.tRaw(key as never, params as TranslationParams);
    }

    // Merge default namespace only when needed.
    return ctx.i18n.tRaw(key as never, { ns, ...params } as TranslationParams);
  }) as UseI18nRawTranslation<DefaultNS, D>;

  /**
   * Reactive translation function that always returns plain text.
   * Structured rich-text output should use `tRaw()` or `<T />`.
   */
  const t = ((key: string, params?: TranslationParams): string => {
    return translationResultToString(tRaw(key as never, params as never));
  }) as UseI18nTranslation<DefaultNS, D>;

  return {
    t,
    tRaw,

    // To support destructuring while maintaining hot-swap capability,
    // we return wrapper accessors instead of returning the getters directly.
    // This ensures ctx.signals.* is called at read time, not at destructure time.
    locale: () => ctx.signals.locale(),
    isLoading: () => ctx.signals.isLoading(),
    isInitializing: () => ctx.signals.isInitializing(),
    isInitialized: () => ctx.signals.isInitialized(),
    cacheRevision: () => ctx.signals.cacheRevision(),
    defaultParams: () => {
      ctx.signals.cacheRevision();
      return ctx.i18n.defaultParams as DefaultParamsSnapshot<D>;
    },

    // Bind all methods dynamically so they always use the current i18n instance.
    // Functions are returned directly to support destructuring safely.
    //
    // `addActiveNamespace`, `reloadTranslations`, `onLoadError` and
    // `onMissingKey` are NOT here: they belong to the `@comvi/core/loader` /
    // `@comvi/core/plugins` capabilities, which a bare-slim host does not
    // have. A closure over an absent member is a silent `undefined is not a
    // function` at CALL time — exactly the failure class §2.4 bans. They are
    // acquired through `useI18nLoader()` / `useI18nPlugins()` instead, which
    // throw one loud, named error at the acquisition point.
    setLocale: (...args) => ctx.i18n.setLocaleAsync(...args),
    addTranslations: (...args) => ctx.i18n.addTranslations(...args),
    setFallbackLocale: (...args) => ctx.i18n.setFallbackLocale(...args),
    setDefaultParams: (params) => ctx.i18n.setDefaultParams(params as never),
    clearTranslations: (...args) => ctx.i18n.clearTranslations(...args),
    hasLocale: (...args) => ctx.i18n.hasLocale(...args),
    hasTranslation: (...args) => ctx.i18n.hasTranslation(...args),
    getLoadedLocales: () => ctx.i18n.getLoadedLocales(),
    getActiveNamespaces: () => ctx.i18n.getActiveNamespaces(),
    getDefaultNamespace: () => ctx.i18n.getDefaultNamespace(),
    getTranslationCache: () => ctx.i18n.translationCache.getInternalMap(),
    on: (...args) => ctx.i18n.on(...args),
    reportError: (...args) => ctx.i18n.reportError(...args),
    formatNumber: (...args) => formatNumber(ctx.i18n, ...args),
    formatDate: (...args) => formatDate(ctx.i18n, ...args),
    formatCurrency: (...args) => formatCurrency(ctx.i18n, ...args),
    formatRelativeTime: (...args) => formatRelativeTime(ctx.i18n, ...args),
    // Derive from the locale signal so the accessor stays reactive
    dir: () => getTextDirection(ctx.signals.locale()),
  };
}
