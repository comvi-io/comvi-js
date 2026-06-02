import { useContext, useMemo } from "react";
import { LocaleContext, useI18nInstance, useStoreRevision } from "./I18nProvider";
import { createBoundTranslation } from "@comvi/core";
import type {
  TranslationParams,
  TranslationResult,
  VirtualNode,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  I18n,
} from "@comvi/core";

import { isVirtualNode } from "./utils";

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

const BIND_METHODS = [
  "addTranslations",
  "addActiveNamespace",
  "setFallbackLocale",
  "onLoadError",
  "clearTranslations",
  "reloadTranslations",
  "hasLocale",
  "hasTranslation",
  "getLoadedLocales",
  "getActiveNamespaces",
  "getDefaultNamespace",
  "on",
  "reportError",
] as const;

export interface UseI18nReturn {
  /** Translate a namespaced key. Returns plain text; for rich-text use `tRaw()` or `<T>`. */
  t<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): string;
  /** Translate a typed key. Returns plain text. */
  t<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): string;
  /** Permissive overload — active only when `TranslationKeys` is empty. */
  t(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): string;

  /** Raw translation function returning the full core `TranslationResult` (string or structured array). */
  tRaw<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): TranslationResult;
  tRaw<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): TranslationResult;
  tRaw(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): TranslationResult;

  locale: string;
  translationCache: ReadonlyMap<string, FlattenedTranslations>;
  isLoading: boolean;
  isInitializing: boolean;

  /** Change the current locale and wait for translations to load. */
  setLocale: (locale: string) => Promise<void>;
  /** Add translations programmatically at runtime. */
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;
  /** Load a new namespace dynamically. */
  addActiveNamespace: (namespace: string) => Promise<void>;

  /** Configure fallback locale chain. */
  setFallbackLocale: (locales: string | string[]) => void;
  /** Register callback for missing keys. */
  onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => string | void,
  ) => () => void;
  /** Register callback for load errors. */
  onLoadError: (callback: (locale: string, namespace: string, error: Error) => void) => () => void;
  /** Clear translations from cache. */
  clearTranslations: (locale?: string, namespace?: string) => void;
  /** Force reload translations from loader. */
  reloadTranslations: (locale?: string, namespace?: string) => Promise<void>;

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
  reportError: I18n["reportError"];
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
export function useI18n(ns?: string): UseI18nReturn {
  const { i18n, isLoading, isInitializing } = useI18nInstance();
  const locale = useContext(LocaleContext) ?? "";

  // Load-bearing: the return value is intentionally unused. This call subscribes
  // the component to the i18n store via useSyncExternalStore — it is what forces a
  // re-render when any of these events fire. Do NOT remove it as "dead code".
  useStoreRevision(
    i18n,
    "namespaceLoaded",
    "initialized",
    "translationsCleared",
    "configChanged",
    "defaultNamespaceChanged",
  );
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
    return wrapper as UseI18nReturn["tRaw"];
  }, [i18n, ns, locale]);

  const t = useMemo(
    () =>
      ((key: string, params?: TranslationParams) =>
        translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn["t"],
    [tRaw],
  );

  const boundMethods = useMemo(() => {
    type BoundName = (typeof BIND_METHODS)[number];
    type Bound = { [K in BoundName]: I18n[K] };
    const methods = {} as Bound;
    const bag = methods as Record<BoundName, unknown>;
    for (const m of BIND_METHODS) {
      bag[m] = (i18n[m] as (...args: unknown[]) => unknown).bind(i18n);
    }
    return {
      ...methods,
      setLocale: (loc: string) => i18n.setLocaleAsync(loc),
      onMissingKey: (callback: (key: string, locale: string, namespace: string) => string | void) =>
        i18n.onMissingKey((key, loc, ns) => {
          const result = callback(key, loc, ns);
          return typeof result === "string" || result === undefined ? result : String(result);
        }),
    };
  }, [i18n]);

  const formatters = useMemo(
    () => ({
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        i18n.formatNumber(value, options, locale),
      formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
        i18n.formatDate(value, options, locale),
      formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) =>
        i18n.formatCurrency(value, currency, options, locale),
      formatRelativeTime: (
        value: number,
        unit: Intl.RelativeTimeFormatUnit,
        options?: Intl.RelativeTimeFormatOptions,
      ) => i18n.formatRelativeTime(value, unit, options, locale),
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
    dir: i18n.dir,
    ...(boundMethods as Omit<
      UseI18nReturn,
      | "t"
      | "tRaw"
      | "locale"
      | "translationCache"
      | "isLoading"
      | "isInitializing"
      | "dir"
      | "formatNumber"
      | "formatDate"
      | "formatCurrency"
      | "formatRelativeTime"
    >),
    ...formatters,
  };
}
