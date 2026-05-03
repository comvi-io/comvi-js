import { useRuntimeConfig } from "#app";
import { buildLocalizedPath } from "../utils/locale-path";

export interface GetPathnameOptions {
  /** Target locale */
  locale: string;
  /** The pathname (without locale prefix) */
  href: string;
}

/**
 * Get routing configuration and helpers
 *
 * Useful for sitemap generation and other routing utilities
 *
 * @example
 * ```typescript
 * // server/routes/sitemap.xml.ts
 * import { useRouteConfig } from '#imports'
 *
 * export default defineEventHandler(() => {
 *   const { locales, defaultLocale, getPathname } = useRouteConfig()
 *
 *   const pages = ['/', '/about', '/contact']
 *   const urls = pages.flatMap((page) =>
 *     locales.map((locale) => ({
 *       loc: `https://example.com${getPathname({ locale, href: page })}`,
 *       // ...
 *     }))
 *   )
 * })
 * ```
 *
 * @example
 * ```typescript
 * // Integration with @nuxtjs/sitemap
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   sitemap: {
 *     urls: () => {
 *       const { locales, getPathname } = useRouteConfig()
 *       // generate localized URLs...
 *     }
 *   }
 * })
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
