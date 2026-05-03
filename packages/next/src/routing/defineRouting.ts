import type { RoutingConfig } from "./types";

/**
 * Define routing configuration for your app
 *
 * This configuration is used by both the middleware and navigation components
 * to handle localized routing.
 *
 * @param config - Routing configuration
 * @returns The same configuration with defaults applied
 *
 * @example
 * ```typescript
 * // i18n/routing.ts
 * import { defineRouting } from '@comvi/next/routing';
 *
 * export const routing = defineRouting({
 *   locales: ['en', 'uk', 'de'],
 *   defaultLocale: 'en',
 *   localePrefix: 'as-needed',
 * });
 * ```
 */
export function defineRouting<T extends string>(
  config: RoutingConfig<T>,
): Required<RoutingConfig<T>> {
  return {
    ...config,
    localePrefix: config.localePrefix ?? "as-needed",
    localeCookie: config.localeCookie ?? "NEXT_LOCALE",
    pathnames: config.pathnames ?? {},
  };
}

/**
 * Type guard to check if a string is a valid locale
 *
 * Use this in layouts/pages to validate the locale parameter
 * and get proper TypeScript narrowing.
 *
 * @param locales - Array of supported locales
 * @param locale - String to check
 * @returns True if locale is valid
 *
 * @example
 * ```typescript
 * import { hasLocale } from '@comvi/next/routing';
 * import { routing } from '@/i18n/routing';
 * import { notFound } from 'next/navigation';
 *
 * export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
 *   const { locale } = await params;
 *
 *   if (!hasLocale(routing.locales, locale)) {
 *     notFound();
 *   }
 *
 *   // locale is now typed as 'en' | 'uk' | 'de'
 *   return <div>Locale: {locale}</div>;
 * }
 * ```
 */
export function hasLocale<T extends string>(locales: readonly T[], locale: string): locale is T {
  return locales.includes(locale as T);
}

/**
 * Options for getPathname function
 */
export interface GetPathnameOptions {
  /** Target locale */
  locale: string;
  /** The pathname (without locale prefix) */
  href: string;
}

/**
 * Creates a getPathname function bound to your routing configuration
 *
 * Use this to construct localized pathnames for sitemaps, hreflang tags,
 * and canonical URLs.
 *
 * @param config - Your routing configuration
 * @returns A getPathname function
 *
 * @example
 * ```typescript
 * // i18n/navigation.ts
 * import { createGetPathname } from '@comvi/next/routing';
 * import { routing } from './routing';
 *
 * export const getPathname = createGetPathname(routing);
 * ```
 *
 * @example
 * ```typescript
 * // app/sitemap.ts
 * import { getPathname } from '@/i18n/navigation';
 * import { routing } from '@/i18n/routing';
 *
 * export default function sitemap() {
 *   const baseUrl = 'https://example.com';
 *   const pages = ['/', '/about', '/contact'];
 *
 *   return pages.flatMap((page) =>
 *     routing.locales.map((locale) => ({
 *       url: `${baseUrl}${getPathname({ locale, href: page })}`,
 *       lastModified: new Date(),
 *       alternates: {
 *         languages: Object.fromEntries(
 *           routing.locales.map((l) => [
 *             l,
 *             `${baseUrl}${getPathname({ locale: l, href: page })}`,
 *           ])
 *         ),
 *       },
 *     }))
 *   );
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Generate hreflang tags
 * import { getPathname } from '@/i18n/navigation';
 * import { routing } from '@/i18n/routing';
 *
 * function generateHreflangTags(currentPath: string) {
 *   return routing.locales.map((locale) => ({
 *     rel: 'alternate',
 *     hrefLang: locale,
 *     href: `https://example.com${getPathname({ locale, href: currentPath })}`,
 *   }));
 * }
 * ```
 */
export function createGetPathname<T extends string>(
  config: Required<RoutingConfig<T>>,
): (options: GetPathnameOptions) => string {
  const { locales, defaultLocale, localePrefix, pathnames } = config;

  return function getPathname({ locale, href }: GetPathnameOptions): string {
    // Validate locale
    if (!locales.includes(locale as T)) {
      console.warn(
        `[getPathname] Unknown locale "${locale}". Expected one of: ${locales.join(", ")}`,
      );
    }

    // Check for custom pathname mapping
    const localizedPath = pathnames[href]?.[locale as T] ?? href;

    // Normalize path (ensure it starts with /)
    const normalizedPath = localizedPath.startsWith("/") ? localizedPath : `/${localizedPath}`;

    // Apply locale prefix based on mode
    switch (localePrefix) {
      case "always":
        // Always add locale prefix
        return `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;

      case "as-needed":
        // Only add prefix for non-default locales
        if (locale === defaultLocale) {
          return normalizedPath;
        }
        return `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;

      case "never":
        // Never add locale prefix
        return normalizedPath;

      default:
        return normalizedPath;
    }
  };
}
