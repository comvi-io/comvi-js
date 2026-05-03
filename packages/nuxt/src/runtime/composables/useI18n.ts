import { useNuxtApp, useState, useRuntimeConfig } from "#app";
import { type Ref } from "vue";
import type {
  TranslationParams,
  TranslationResult,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  I18n,
} from "@comvi/core";
import { createBoundTranslation } from "@comvi/core";
import { translationResultToString } from "../utils";

export interface UseI18nReturn {
  /** Translation function - namespaced keys (when ns is provided) */
  t<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): string;

  /** Translation function - typed keys */
  t<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): string;

  /** Permissive overload - only active when TranslationKeys is empty */
  t(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): string;

  /** Raw translation function - namespaced keys (when ns is provided) */
  tRaw<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): TranslationResult;

  /** Raw translation function - typed keys */
  tRaw<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): TranslationResult;

  /** Raw permissive overload - only active when TranslationKeys is empty */
  tRaw(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): TranslationResult;

  /** Current locale (reactive) */
  locale: Ref<string>;

  /**
   * Set locale asynchronously.
   * Waits for translations to load before updating the locale state.
   */
  setLocale: (locale: string) => Promise<void>;

  /** Translation cache (computed readonly ref) */
  translationCache: Readonly<Ref<Readonly<ReadonlyMap<string, FlattenedTranslations>>>>;

  /** Loading state (readonly reactive) */
  isLoading: Readonly<Ref<boolean>>;

  /** Initializing state (readonly reactive) */
  isInitializing: Readonly<Ref<boolean>>;

  // ===== Core Methods =====

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

  // ===== Event Subscription =====

  /** Subscribe to i18n events */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;

  /** Report an error to the configured onError handler */
  reportError: I18n["reportError"];

  // ===== Formatting =====

  /** Format a number using the current locale */
  formatNumber: I18n["formatNumber"];

  /** Format a date using the current locale */
  formatDate: I18n["formatDate"];

  /** Format a number as currency using the current locale */
  formatCurrency: I18n["formatCurrency"];

  /** Format a relative time ("2 hours ago", "in 3 days") using the current locale */
  formatRelativeTime: I18n["formatRelativeTime"];

  /** Text direction for the current locale, as a reactive computed ref */
  dir: import("vue").ComputedRef<"ltr" | "rtl">;

  // ===== Nuxt-Specific =====

  /** Available locales from config */
  locales: readonly string[];

  /** Default locale from config */
  defaultLocale: string;
}

/**
 * Nuxt composable to access the i18n instance
 *
 * Wraps @comvi/vue's useI18n with Nuxt state synchronization
 *
 * @param ns - Optional namespace to scope translations to
 * @returns Object with translation function, reactive state, and i18n methods
 *
 * @example
 * ```vue
 * <script setup>
 * const { t, locale, setLocale, locales } = useI18n()
 * </script>
 *
 * <template>
 *   <div>{{ t('greeting') }}</div>
 *   <select @change="setLanguage($event.target.value)">
 *     <option v-for="locale in locales" :key="locale" :value="locale">
 *       {{ locale }}
 *     </option>
 *   </select>
 * </template>
 * ```
 */
export function useI18n(ns?: string): UseI18nReturn {
  const nuxtApp = useNuxtApp();
  const config = useRuntimeConfig();
  const publicConfig = config.public.comvi;

  const i18n = nuxtApp.$i18n;

  if (!i18n) {
    throw new Error(
      "[@comvi/nuxt] i18n not initialized. Make sure @comvi/nuxt module is configured in nuxt.config.ts",
    );
  }

  // Get locale state for synchronization
  const localeState = useState<string>("i18n-locale");

  // Create scoped translation functions
  const tRaw = createBoundTranslation(i18n, ns) as UseI18nReturn["tRaw"];
  const t = ((key: string, params?: TranslationParams) =>
    translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn["t"];

  // Wrap setLocale to sync with Nuxt state
  const setLocale = async (newLocale: string) => {
    await i18n.setLocale(newLocale);
    localeState.value = newLocale;
  };

  return {
    t,
    tRaw,
    locale: i18n.locale,
    setLocale,
    translationCache: i18n.translationCache,
    isLoading: i18n.isLoading,
    isInitializing: i18n.isInitializing,
    addTranslations: i18n.addTranslations,
    addActiveNamespace: i18n.addActiveNamespace,
    setFallbackLocale: i18n.setFallbackLocale,
    onMissingKey: i18n.onMissingKey,
    onLoadError: i18n.onLoadError,
    clearTranslations: i18n.clearTranslations,
    reloadTranslations: i18n.reloadTranslations,
    hasLocale: i18n.hasLocale,
    hasTranslation: i18n.hasTranslation,
    getLoadedLocales: i18n.getLoadedLocales,
    getActiveNamespaces: i18n.getActiveNamespaces,
    getDefaultNamespace: i18n.getDefaultNamespace,
    on: i18n.on,
    reportError: i18n.reportError,
    formatNumber: i18n.formatNumber,
    formatDate: i18n.formatDate,
    formatCurrency: i18n.formatCurrency,
    formatRelativeTime: i18n.formatRelativeTime,
    dir: i18n.dir,
    // Nuxt-specific
    locales: publicConfig.locales,
    defaultLocale: publicConfig.defaultLocale,
  };
}
