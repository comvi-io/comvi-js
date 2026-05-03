import { useRuntimeConfig, useRoute } from "#app";
import { stripLocalePrefix, buildLocalizedPath, splitPathAndSuffix } from "../utils/locale-path";

/**
 * Composable to get paths for switching locales
 *
 * Returns the current route path with a different locale
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
  const { locales, defaultLocale, localePrefix } = config.public.comvi;
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
      if (process.dev) {
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

    // Apply prefix based on mode
    return `${buildLocalizedPath(cleanPath, locale, defaultLocale, localePrefix)}${suffix}`;
  }

  return switchLocalePath;
}
