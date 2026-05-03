import { inject, type Ref } from "vue";
import { I18N_INJECTION_KEY } from "../keys";
import { createBoundTranslation } from "@comvi/core";
import { translationResultToString } from "../utils";
import type {
  TranslationParams,
  TranslationResult,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  I18n,
} from "@comvi/core";

export interface UseI18nReturn {
  /** Translation function - namespaced keys (when ns is provided). Always returns plain text. */
  t<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): string;

  /** Translation function - typed keys (default namespace only, use ns option for others). */
  t<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): string;

  /** Permissive overload - only active when TranslationKeys is empty */
  t(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): string;

  /** Raw translation result for rich text renderers and advanced integrations. */
  tRaw<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): TranslationResult;

  /** Raw translation result for typed keys. */
  tRaw<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): TranslationResult;

  /** Raw translation result for permissive keys. */
  tRaw(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): TranslationResult;

  /** Current locale (reactive Vue Ref) */
  locale: Ref<string>;

  /** Set locale asynchronously */
  setLocale: (locale: string) => Promise<void>;

  /** Translation cache (stable readonly ref with manual triggers, no cloning) */
  translationCache: Readonly<Ref<Readonly<ReadonlyMap<string, FlattenedTranslations>>>>;

  /** Loading state (readonly reactive Vue Ref) */
  isLoading: Readonly<Ref<boolean>>;

  /** Initializing state (readonly reactive Vue Ref) */
  isInitializing: Readonly<Ref<boolean>>;

  /** Add translations programmatically at runtime */
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  /** Load a new namespace dynamically */
  addActiveNamespace: (namespace: string) => Promise<void>;

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

  /** Check if a locale is loaded for a namespace */
  hasLocale: (locale: string, namespace?: string) => boolean;

  /** Check if a translation exists */
  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;

  /** Get list of all loaded locale codes */
  getLoadedLocales: () => string[];

  /** Get list of active namespaces */
  getActiveNamespaces: () => string[];

  /** Get default namespace */
  getDefaultNamespace: () => string;

  /** Subscribe to i18n events */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;

  /** Report an error to the configured onError handler */
  reportError: I18n["reportError"];

  /** Format a number using the current language locale */
  formatNumber: I18n["formatNumber"];

  /** Format a date using the current language locale */
  formatDate: I18n["formatDate"];

  /** Format a number as currency using the current language locale */
  formatCurrency: I18n["formatCurrency"];

  /** Format a relative time ("2 hours ago", "in 3 days") using the current language locale */
  formatRelativeTime: I18n["formatRelativeTime"];

  /** Text direction for the current language, as a reactive computed ref */
  dir: import("vue").ComputedRef<"ltr" | "rtl">;

  /** Cleanup resources (call when i18n instance is no longer needed) */
  destroy: () => void;
}

/** Keys copied from the i18n instance as direct references */
const PASSTHROUGH_KEYS = [
  "locale",
  "setLocale",
  "translationCache",
  "isLoading",
  "isInitializing",
  "addTranslations",
  "addActiveNamespace",
  "setFallbackLocale",
  "onMissingKey",
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
  "formatNumber",
  "formatDate",
  "formatCurrency",
  "formatRelativeTime",
  "dir",
  "destroy",
] as const;

/**
 * Vue composable to access the i18n instance
 * Must be used within a component that has access to the i18n plugin
 *
 * @param ns - Optional namespace to scope translations to
 * @returns Object with translation function, reactive state, and i18n methods
 */
export function useI18n(ns?: string): UseI18nReturn {
  const i18n = inject(I18N_INJECTION_KEY);

  if (!i18n) {
    throw new Error(
      "[i18n] useI18n must be used within a Vue app with i18n plugin installed. " +
        "Make sure you called app.use(i18n) before using this composable.",
    );
  }

  const tRaw = createBoundTranslation(i18n, ns) as UseI18nReturn["tRaw"];
  const t = ((key: string, params?: TranslationParams) =>
    translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn["t"];

  const result = { t, tRaw } as UseI18nReturn;
  for (const k of PASSTHROUGH_KEYS) {
    (result as any)[k] = (i18n as any)[k];
  }
  return result;
}
