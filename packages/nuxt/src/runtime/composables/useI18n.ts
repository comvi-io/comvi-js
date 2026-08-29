import { useNuxtApp, useRuntimeConfig } from "#app";
import { useLocaleState } from "../utils/locale-state";
import { type Ref, computed } from "vue";
import type { TranslationParams, DefaultTranslationParams } from "@comvi/core";
import { createBoundTranslation, translationResultToString } from "@comvi/core";
import type { UseI18nReturn as VueUseI18nReturn } from "@comvi/vue";

export interface UseI18nReturn<
  D extends DefaultTranslationParams = {},
> extends VueUseI18nReturn<D> {
  /** Available locales from runtime config (Nuxt-specific) */
  locales: Ref<readonly string[]>;
  /** Default locale from runtime config (Nuxt-specific) */
  defaultLocale: Ref<string>;
}

/**
 * Wraps @comvi/vue's useI18n with Nuxt state synchronization.
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
export function useI18n<D extends DefaultTranslationParams = {}>(ns?: string): UseI18nReturn<D> {
  const nuxtApp = useNuxtApp();
  const config = useRuntimeConfig();
  const publicConfig = config.public.comvi;

  const i18n = nuxtApp.$i18n;

  if (!i18n) {
    throw new Error(
      "[@comvi/nuxt] i18n not initialized. Make sure @comvi/nuxt module is configured in nuxt.config.ts",
    );
  }

  const localeState = useLocaleState();

  const tRaw = createBoundTranslation(i18n, ns) as UseI18nReturn<D>["tRaw"];
  const t = ((key: string, params?: TranslationParams) =>
    translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn<D>["t"];

  // setLocale must also advance the Nuxt state the middleware watches.
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
    setFallbackLocale: i18n.setFallbackLocale,
    defaultParams: i18n.defaultParams as VueUseI18nReturn<D>["defaultParams"],
    setDefaultParams: i18n.setDefaultParams,
    clearTranslations: i18n.clearTranslations,
    hasLocale: i18n.hasLocale,
    hasTranslation: i18n.hasTranslation,
    hasLocaleNow: i18n.hasLocaleNow,
    hasTranslationNow: i18n.hasTranslationNow,
    loadedLocales: i18n.loadedLocales,
    activeNamespaces: i18n.activeNamespaces,
    defaultNamespace: i18n.defaultNamespace,
    on: i18n.on,
    reportError: i18n.reportError,
    formatNumber: i18n.formatNumber,
    formatDate: i18n.formatDate,
    formatCurrency: i18n.formatCurrency,
    formatRelativeTime: i18n.formatRelativeTime,
    dir: i18n.dir,
    destroy: i18n.destroy,
    locales: computed(() => publicConfig.locales as readonly string[]),
    defaultLocale: computed(() => publicConfig.defaultLocale),
  };
}
