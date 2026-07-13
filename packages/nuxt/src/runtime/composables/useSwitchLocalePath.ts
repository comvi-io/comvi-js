import { useRuntimeConfig, useRoute } from "#app";
import {
  stripLocalePrefix,
  buildLocalizedPath,
  splitPathAndSuffix,
  setQueryParamInSuffix,
} from "../utils/locale-path";

/**
 * Composable to get paths for switching locales
 *
 * Returns the current route path with a different locale. When query-parameter
 * detection is configured, the generated URL keeps that parameter synchronized.
 *
 * @returns Function that returns the current path in a different locale
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
   * Get current route path with a different locale
   *
   * @param locale - Target locale (must be in configured locales list)
   * @returns Path with new locale prefix
   * @throws Warning in dev mode if locale is not in the configured list
   */
  function switchLocalePath(locale: string): string {
    // Validate locale is in the allowed list
    if (!locales.includes(locale)) {
      if (import.meta.dev) {
        console.warn(
          `[@comvi/nuxt] switchLocalePath called with invalid locale "${locale}". ` +
            `Available locales: ${locales.join(", ")}`,
        );
      }
      // Fall back to default locale for invalid input
      locale = defaultLocale;
    }

    const { pathname, suffix } = splitPathAndSuffix(route.fullPath || route.path);

    // Strip current locale prefix if present
    const cleanPath = stripLocalePrefix(pathname, locales);

    // Apply prefix based on mode and keep the configured locale query in sync.
    const localizedPath = buildLocalizedPath(cleanPath, locale, defaultLocale, localePrefix);
    const localizedSuffix = queryParam ? setQueryParamInSuffix(suffix, queryParam, locale) : suffix;
    return `${localizedPath}${localizedSuffix}`;
  }

  return switchLocalePath;
}
