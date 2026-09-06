import { useRuntimeConfig } from "#app";
import { buildLocalizedPath } from "../utils/locale-path";

export interface GetPathnameOptions {
  locale: string;
  /** The pathname (without locale prefix) */
  href: string;
}

/**
 * Get routing configuration and helpers — for alternate-link lists, language
 * switchers and other routing utilities.
 *
 * APP-SIDE ONLY. The module auto-imports this through `addImports`, which
 * populates `#imports` for the Nuxt app, not the Nitro server — and it reads
 * `useRuntimeConfig()` from `#app` with no event, so a Nitro route calling it
 * fails at request time. In a server route read the same values off the event:
 * `useRuntimeConfig(event).public.comvi`.
 *
 * @example
 * ```vue
 * <!-- components/AlternateLinks.vue -->
 * <script setup lang="ts">
 * // `href` is the UNPREFIXED path; getPathname adds the locale prefix.
 * const { getAllLocalizedPaths } = useRouteConfig()
 *
 * const alternates = getAllLocalizedPaths('/about').map(({ locale, path }) => ({
 *   locale,
 *   href: `https://example.com${path}`,
 * }))
 * </script>
 * ```
 */
export function useRouteConfig() {
  const config = useRuntimeConfig();
  const { locales, defaultLocale, localePrefix } = config.public.comvi;

  /**
   * Get localized pathname
   *
   * Converts a path to include the correct locale prefix based on configuration
   */
  function getPathname({ locale, href }: GetPathnameOptions): string {
    return buildLocalizedPath(href, locale, defaultLocale, localePrefix);
  }

  /**
   * Get all localized versions of a path
   *
   * Useful for generating alternates in sitemap
   */
  function getAllLocalizedPaths(href: string): Array<{ locale: string; path: string }> {
    return locales.map((locale) => ({
      locale,
      path: getPathname({ locale, href }),
    }));
  }

  return {
    locales,
    defaultLocale,
    localePrefix,
    getPathname,
    getAllLocalizedPaths,
  };
}
