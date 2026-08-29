import { type Accessor } from "solid-js";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
  translationResultToString,
} from "@comvi/core";
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

/** Loader/plugin-host members are NOT part of it — see `capabilityHooks`. */
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
      /** With `useI18n(ns)`, `t('title')` means `t('title', { ns })`. */
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
 * The host-only translation surface. Loader and plugin-host members are not
 * part of it — they do not exist on a base host, so a type promising them
 * would be lying; `useI18nLoader()` / `useI18nPlugins()` acquire those.
 */
export interface UseI18nReturn<
  DefaultNS extends string | undefined = undefined,
  D extends DefaultTranslationParams = {},
> {
  /**
   * Always plain text, and reactive: call it directly in JSX, with no second
   * call to unwrap an accessor.
   *
   * @example
   * ```tsx
   * <p>{t('welcome', { name: 'Alice' })}</p>
   * ```
   */
  t: UseI18nTranslation<DefaultNS, D>;

  /** The full core `TranslationResult`: a string or a structured array. */
  tRaw: UseI18nRawTranslation<DefaultNS, D>;

  locale: Accessor<string>;

  isLoading: Accessor<boolean>;

  isInitializing: Accessor<boolean>;

  isInitialized: Accessor<boolean>;

  /** Monotonic; read it to depend on cache and config changes. */
  cacheRevision: Accessor<number>;

  /** Shallow snapshot of instance-level interpolation defaults. */
  defaultParams: Accessor<DefaultParamsSnapshot<D>>;

  /** Resolves once translations for the new locale have loaded. */
  setLocale: Host["setLocaleAsync"];

  addTranslations: Host["addTranslations"];

  setFallbackLocale: Host["setFallbackLocale"];

  /** Replace instance-level interpolation defaults. */
  setDefaultParams: Host<D>["setDefaultParams"];

  clearTranslations: Host["clearTranslations"];

  hasLocale: Host["hasLocale"];

  hasTranslation: Host["hasTranslation"];

  getLoadedLocales: () => string[];

  getActiveNamespaces: Host["getActiveNamespaces"];

  getDefaultNamespace: Host["getDefaultNamespace"];

  getTranslationCache: () => ReadonlyMap<string, FlattenedTranslations>;

  /** Returns an unsubscribe function. */
  on: Host["on"];

  /** Routes to the configured `onError` handler. */
  reportError: Host["reportError"];

  // The formatters below default to the current locale.
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

  dir: () => "ltr" | "rtl";
}

/**
 * Must be called under an `<I18nProvider>`.
 *
 * @param ns - Scopes `t` / `tRaw` so key lookups default to this namespace.
 *
 * @example
 * ```tsx
 * function Greeting() {
 *   const { t, locale, setLocale } = useI18n();
 *   return (
 *     <div>
 *       <p>{t('greeting')} ({locale()})</p>
 *       <button onClick={() => setLocale('fr')}>Français</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useI18n<
  DefaultNS extends string | undefined = undefined,
  D extends DefaultTranslationParams = {},
>(ns?: DefaultNS): UseI18nReturn<DefaultNS, D> {
  const ctx = useI18nContextValue();

  const tRaw = ((key: string, params?: TranslationParams): TranslationResult => {
    // The signal reads below ARE the reactive dependencies. Subscribe to the
    // global locale only when the caller pinned none: `tRaw(key, { locale })`
    // does not depend on the active locale, and tracking it there would
    // recompute on every unrelated global locale change.
    if (params?.locale === undefined) {
      ctx.signals.locale();
    }
    ctx.signals.cacheRevision();
    if (ns === undefined) {
      ctx.signals.defaultNamespace();
    }

    // No params: keep core's fast path and allocate no options object.
    if (params == null) {
      if (ns === undefined) {
        return ctx.i18n.tRaw(key as never);
      }
      return ctx.i18n.tRaw(key as never, { ns } as TranslationParams);
    }

    // An explicit namespace is never overridden.
    if (params.ns !== undefined || ns === undefined) {
      return ctx.i18n.tRaw(key as never, params as TranslationParams);
    }

    return ctx.i18n.tRaw(key as never, { ns, ...params } as TranslationParams);
  }) as UseI18nRawTranslation<DefaultNS, D>;

  const t = ((key: string, params?: TranslationParams): string => {
    return translationResultToString(tRaw(key as never, params as never));
  }) as UseI18nTranslation<DefaultNS, D>;

  return {
    t,
    tRaw,

    // Wrapper accessors, not the getters themselves, so `ctx.signals.*` is
    // read at CALL time and a destructured binding still follows a hot-swapped
    // instance.
    locale: () => ctx.signals.locale(),
    isLoading: () => ctx.signals.isLoading(),
    isInitializing: () => ctx.signals.isInitializing(),
    isInitialized: () => ctx.signals.isInitialized(),
    cacheRevision: () => ctx.signals.cacheRevision(),
    defaultParams: () => {
      ctx.signals.cacheRevision();
      return ctx.i18n.defaultParams as DefaultParamsSnapshot<D>;
    },

    // Dispatched through `ctx.i18n` on every call, so they follow a swapped
    // instance and survive destructuring.
    //
    // `addActiveNamespace`, `reloadTranslations`, `onLoadError` and
    // `onMissingKey` are NOT here: they belong to capabilities a base host does
    // not have, and a closure over an absent member is a silent "undefined is
    // not a function" at CALL time. `useI18nLoader()` / `useI18nPlugins()`
    // acquire them instead, throwing one named error at the acquisition point.
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
    dir: () => getTextDirection(ctx.signals.locale()),
  };
}
