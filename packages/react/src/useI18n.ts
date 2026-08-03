import { useContext, useMemo } from "react";
import { LocaleContext, useI18nInstance, useStoreRevision } from "./I18nProvider";
import {
  createBoundTranslation,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
  isVirtualNode,
} from "@comvi/core";
import type {
  TranslationParams,
  TranslationResult,
  TranslateFn,
  VirtualNode,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  WrapperI18nHost,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
} from "@comvi/core";

type ReactElementLike = {
  $$typeof: unknown;
  props?: {
    children?: unknown;
  };
};

function isReactElementLike(value: unknown): value is ReactElementLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "$$typeof" in value &&
    "props" in value &&
    typeof (value as { props?: unknown }).props === "object"
  );
}

function virtualNodeToText(node: VirtualNode): string {
  if (node.type === "text") {
    return node.text;
  }

  let text = "";
  for (const child of node.children) {
    if (typeof child === "string") {
      text += child;
      continue;
    }
    text += virtualNodeToText(child);
  }
  return text;
}

function reactNodeToText(node: unknown): string {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    let text = "";
    for (const item of node) {
      text += reactNodeToText(item);
    }
    return text;
  }
  if (isVirtualNode(node)) {
    return virtualNodeToText(node);
  }
  if (isReactElementLike(node)) {
    return reactNodeToText(node.props?.children);
  }
  return String(node);
}

function translationResultToString(result: TranslationResult): string {
  if (typeof result === "string") {
    return result;
  }

  let text = "";
  for (const part of result as Array<unknown>) {
    if (typeof part === "string") {
      text += part;
      continue;
    }
    if (isVirtualNode(part)) {
      text += virtualNodeToText(part);
      continue;
    }
    if (isReactElementLike(part)) {
      text += reactNodeToText(part.props?.children);
      continue;
    }
    text += String(part);
  }
  return text;
}

/**
 * Host type every react binding demands (framework-slim D′): the reactive
 * translation host, exactly what bare `@comvi/core` implements.
 */
type Host = WrapperI18nHost;

/**
 * Core methods rebound to the host instance.
 *
 * `addActiveNamespace`, `reloadTranslations` and `onLoadError` are NOT here:
 * they belong to the `@comvi/core/loader` capability, which a bare-slim host
 * does not have — binding them eagerly would crash at bind time. They are
 * acquired through `useI18nLoader()` instead (plan §3.2), as `onMissingKey`
 * is through `useI18nPlugins()`.
 */
const BIND_METHODS = [
  "addTranslations",
  "setFallbackLocale",
  "setDefaultParams",
  "clearTranslations",
  "hasLocale",
  "hasTranslation",
  "getLoadedLocales",
  "getActiveNamespaces",
  "getDefaultNamespace",
  "on",
  "reportError",
] as const;

/**
 * The host-only translation surface. The four capability members that used to
 * live here — `addActiveNamespace`, `reloadTranslations`, `onLoadError`
 * (loader) and `onMissingKey` (plugins) — moved to `useI18nLoader()` /
 * `useI18nPlugins()` in 0.5.0: they do not exist on a bare-slim host, so a
 * type that promised them was lying (plan §2.4).
 */
export interface UseI18nReturn<D extends DefaultTranslationParams = {}> {
  /** Translate a key. Returns plain text; for rich-text use `tRaw()` or `<T>`. */
  t: TranslateFn<D, string>;

  /** Raw translation function returning the full core `TranslationResult` (string or structured array). */
  tRaw: TranslateFn<D, TranslationResult>;

  locale: string;
  translationCache: ReadonlyMap<string, FlattenedTranslations>;
  isLoading: boolean;
  isInitializing: boolean;

  /** Change the current locale and wait for translations to load. */
  setLocale: (locale: string) => Promise<void>;
  /** Add translations programmatically at runtime. */
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  /** Configure fallback locale chain. */
  setFallbackLocale: (locales: string | string[]) => void;
  /** Current interpolation defaults for this render (shallow snapshot). */
  defaultParams: DefaultParamsSnapshot<D>;
  /** Replace instance-level interpolation defaults. */
  setDefaultParams: Host["setDefaultParams"];
  /** Clear translations from cache. */
  clearTranslations: (locale?: string, namespace?: string) => void;

  /** Check if a locale is loaded for a namespace. */
  hasLocale: (locale: string, namespace?: string) => boolean;
  /** Check if a translation exists. */
  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;
  /** Get list of all loaded locale codes. */
  getLoadedLocales: () => string[];
  /** Get list of active namespaces. */
  getActiveNamespaces: () => string[];
  /** Get default namespace. */
  getDefaultNamespace: () => string;

  /** Format a number using the current locale. */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Format a date using the current locale. */
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  /** Format a number as currency using the current locale. */
  formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) => string;
  /** Format a relative time ("2 hours ago"). */
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ) => string;

  /** Text direction for the current locale. */
  dir: "ltr" | "rtl";

  /** Subscribe to i18n events. Returns an unsubscribe function. */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;
  /** Report an error to the configured onError handler. */
  reportError: Host["reportError"];
}

/**
 * Access i18n functionality in React components. Must be used within an `<I18nProvider>`.
 *
 * @remarks
 * Returns a NEW object every render — destructure the fields you need rather
 * than passing the whole return value to `useEffect` deps. For locale-only
 * consumers, prefer the `useLocale()` selector hook.
 *
 * @example
 * ```tsx
 * function Greeting() {
 *   const { t, locale } = useI18n();
 *   return <p>{t('greeting')} ({locale})</p>;
 * }
 * ```
 */
export function useI18n<D extends DefaultTranslationParams = {}>(ns?: string): UseI18nReturn<D> {
  const { i18n, isLoading, isInitializing } = useI18nInstance();
  const locale = useContext(LocaleContext) ?? "";

  // Load-bearing: subscribes this component to re-render on the canonical
  // revision event set (return unused).
  useStoreRevision(i18n);
  const translationCache = i18n.translationCache.getInternalMap();

  // Inject the React-tracked `locale` into every bound call so descendant
  // translations resolve against the render-time locale (not the mutable
  // instance locale). Explicit `params.locale` wins via spread order.
  const tRaw = useMemo(() => {
    const bound = createBoundTranslation(i18n, ns) as (
      key: string,
      params?: TranslationParams,
    ) => TranslationResult;
    const wrapper = (key: string, params?: TranslationParams): TranslationResult =>
      bound(key, { locale, ...params });
    return wrapper as UseI18nReturn<D>["tRaw"];
  }, [i18n, ns, locale]);

  const t = useMemo(
    () =>
      ((key: string, params?: TranslationParams) =>
        translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn<D>["t"],
    [tRaw],
  );

  const boundMethods = useMemo(() => {
    type BoundName = (typeof BIND_METHODS)[number];
    type Bound = { [K in BoundName]: Host[K] };
    const methods = {} as Bound;
    const bag = methods as Record<BoundName, unknown>;
    for (const m of BIND_METHODS) {
      bag[m] = (i18n[m] as (...args: unknown[]) => unknown).bind(i18n);
    }
    return {
      ...methods,
      setLocale: (loc: string) => i18n.setLocaleAsync(loc),
    };
  }, [i18n]);

  const formatters = useMemo(
    () => ({
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(i18n, value, options, locale),
      formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
        formatDate(i18n, value, options, locale),
      formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) =>
        formatCurrency(i18n, value, currency, options, locale),
      formatRelativeTime: (
        value: number,
        unit: Intl.RelativeTimeFormatUnit,
        options?: Intl.RelativeTimeFormatOptions,
      ) => formatRelativeTime(i18n, value, unit, options, locale),
    }),
    [i18n, locale],
  );

  return {
    t,
    tRaw,
    locale,
    translationCache,
    isLoading,
    isInitializing,
    defaultParams: i18n.defaultParams as DefaultParamsSnapshot<D>,
    dir: getTextDirection(locale || i18n.locale),
    ...(boundMethods as Omit<
      UseI18nReturn<D>,
      | "t"
      | "tRaw"
      | "locale"
      | "translationCache"
      | "isLoading"
      | "isInitializing"
      | "defaultParams"
      | "dir"
      | "formatNumber"
      | "formatDate"
      | "formatCurrency"
      | "formatRelativeTime"
    >),
    ...formatters,
  };
}
