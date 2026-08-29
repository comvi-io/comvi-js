import { useRuntimeConfig, useRoute } from "#app";
import {
  stripLocalePrefix,
  buildLocalizedPath,
  splitPathAndSuffix,
  setQueryParamInSuffix,
} from "../utils/locale-path";

/**
 * Returns the current route path with a different locale. When query-parameter
 * detection is configured, the generated URL keeps that parameter synchronized.
 *
 * @example
 * ```vue
 * <script setup>
 * const switchLocalePath = useSwitchLocalePath()
 * </script>
 *
 * <template>
 *   <NuxtLink
 *     v-for="locale in ['en', 'de', 'uk']"
 *     :key="locale"
 *     :to="switchLocalePath(locale)"
 *   >
 *     {{ locale }}
 *   </NuxtLink>
 * </template>
 * ```
 */
export function useSwitchLocalePath() {
  const config = useRuntimeConfig();
  const { locales, defaultLocale, localePrefix, detectBrowserLanguage } = config.public.comvi;
  const queryParam =
    detectBrowserLanguage && typeof detectBrowserLanguage === "object"
      ? detectBrowserLanguage.queryParam
      : undefined;
  const route = useRoute();

  /**
   * @param locale - must be in the configured locales list; an unknown one
   *   warns in dev mode and falls back to the default locale.
   */
  function switchLocalePath(locale: string): string {
    if (!locales.includes(locale)) {
      if (import.meta.dev) {
        console.warn(
          `[@comvi/nuxt] switchLocalePath called with invalid locale "${locale}". ` +
            `Available locales: ${locales.join(", ")}`,
        );
      }
      locale = defaultLocale;
    }

    const { pathname, suffix } = splitPathAndSuffix(route.fullPath || route.path);

    const cleanPath = stripLocalePrefix(pathname, locales);

    // Apply prefix based on mode and keep the configured locale query in sync.
    const localizedPath = buildLocalizedPath(cleanPath, locale, defaultLocale, localePrefix);
    const localizedSuffix = queryParam ? setQueryParamInSuffix(suffix, queryParam, locale) : suffix;
    return `${localizedPath}${localizedSuffix}`;
  }

  return switchLocalePath;
}
