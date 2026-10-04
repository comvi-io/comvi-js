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
  NamespaceBoundTranslateFn,
  FlattenedMessages,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
  LocaleSource,
} from "@comvi/core";

/** Loader/plugin-host members are NOT part of it — see `capabilityHooks`. */
type Host<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D>;

// The namespace-bound narrowing is core's `NamespaceBoundTranslateFn`, shared
// by all four wrappers, so `useI18n("admin").t("dashboard")` reads the same in
// each of them.
type UseI18nTranslation<
  DefaultNS extends string | undefined,
  D extends DefaultTranslationParams,
> = NamespaceBoundTranslateFn<DefaultNS, D, string>;

type UseI18nRawTranslation<
  DefaultNS extends string | undefined,
  D extends DefaultTranslationParams,
> = NamespaceBoundTranslateFn<DefaultNS, D, TranslationResult>;

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
  setLocale: Host["setLocale"];

  addMessages: Host["addMessages"];

  setFallbackLocale: Host["setFallbackLocale"];

  /** Replace instance-level interpolation defaults. */
  setDefaultParams: Host<D>["setDefaultParams"];

  clearMessages: Host["clearMessages"];

  hasLocale: Host["hasLocale"];

  hasTranslation: Host["hasTranslation"];

  getLoadedLocales: () => string[];

  getActiveNamespaces: Host["getActiveNamespaces"];

  getDefaultNamespace: Host["getDefaultNamespace"];

  getTranslationCache: () => ReadonlyMap<string, FlattenedMessages>;

  /** Returns an unsubscribe function. */
  on: Host["on"];

  /** Routes to the configured `onError` handler. */
  reportError: Host["reportError"];

  // The formatters below default to the current locale and are reactive: a
  // trailing `locale` argument overrides it.
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

  // D″ tombstones. These four members LEFT `useI18n()` in 0.5 for
  // `useI18nLoader()` / `useI18nPlugins()`. Declaring each optional and
  // `never` keeps the name visible — struck through in autocomplete, with the
  // acquisition in the tooltip — while any use stays a type error. Type-only:
  // the object `useI18n()` returns never carries these keys, in any build.
  /** @deprecated Moved in 0.5. Acquire it: `const { addActiveNamespace } = useI18nLoader()`. Optional only so the key can be absent: `if (bag.addActiveNamespace)` compiles and is always false. */
  addActiveNamespace?: never;
  /** @deprecated Moved in 0.5. Acquire it: `const { reloadMessages } = useI18nLoader()`. Optional only so the key can be absent: `if (bag.reloadMessages)` compiles and is always false. */
  reloadMessages?: never;
  /** @deprecated Moved in 0.5. Acquire it: `const { onLoadError } = useI18nLoader()`. Optional only so the key can be absent: `if (bag.onLoadError)` compiles and is always false. */
  onLoadError?: never;
  /** @deprecated Moved in 0.5. Acquire it: `const { onMissingKey } = useI18nPlugins()`. Optional only so the key can be absent: `if (bag.onMissingKey)` compiles and is always false. */
  onMissingKey?: never;
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

  // What the bound formatters read their default locale from. The getter
  // reads the locale signal, so a JSX expression, memo or effect that calls a
  // formatter re-runs on a locale switch, as `t()` does. An explicit trailing
  // `locale` argument short-circuits in core and never reaches the getter.
  const localeSource: LocaleSource = {
    get locale() {
      return ctx.signals.locale();
    },
  };

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
    // `addActiveNamespace`, `reloadMessages`, `onLoadError` and
    // `onMissingKey` are NOT here: they belong to capabilities a base host does
    // not have, and a closure over an absent member is a silent "undefined is
    // not a function" at CALL time. `useI18nLoader()` / `useI18nPlugins()`
    // acquire them instead, throwing one named error at the acquisition point.
    setLocale: (...args) => ctx.i18n.setLocale(...args),
    addMessages: (...args) => ctx.i18n.addMessages(...args),
    setFallbackLocale: (...args) => ctx.i18n.setFallbackLocale(...args),
    setDefaultParams: (params) => ctx.i18n.setDefaultParams(params as never),
    clearMessages: (...args) => ctx.i18n.clearMessages(...args),
    hasLocale: (...args) => ctx.i18n.hasLocale(...args),
    hasTranslation: (...args) => ctx.i18n.hasTranslation(...args),
    getLoadedLocales: () => ctx.i18n.getLoadedLocales(),
    getActiveNamespaces: () => ctx.i18n.getActiveNamespaces(),
    getDefaultNamespace: () => ctx.i18n.getDefaultNamespace(),
    getTranslationCache: () => ctx.i18n.translationCache.getInternalMap(),
    on: (...args) => ctx.i18n.on(...args),
    reportError: (...args) => ctx.i18n.reportError(...args),
    formatNumber: (...args) => formatNumber(localeSource, ...args),
    formatDate: (...args) => formatDate(localeSource, ...args),
    formatCurrency: (...args) => formatCurrency(localeSource, ...args),
    formatRelativeTime: (...args) => formatRelativeTime(localeSource, ...args),
    dir: () => getTextDirection(ctx.signals.locale()),
  };
}
