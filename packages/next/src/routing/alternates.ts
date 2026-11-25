import { buildLocalizedPath } from "@comvi/locale-routing";
import type { GetPathnameOptions } from "./defineRouting";
import type { RoutingConfig } from "./types";

/** The `alternates` value of a page's metadata: paths, resolved by Next against `metadataBase`. */
export interface Alternates {
  canonical: string;
  /** One path per locale plus `x-default` (the default locale's); absent with `localePrefix: "never"`. */
  languages?: Record<string, string>;
}

/**
 * The `alternates` of a page for `generateMetadata`: its canonical URL in this
 * locale and, per locale, the hreflang URL. Every path is exactly what
 * `getPathname` returns for that locale. `href` is the page's `pathnames` key
 * (its canonical path): no locale prefix, no query, no hash. Returns paths: set
 * `metadataBase` in the root layout, or Next leaves them relative. An unknown
 * `locale` warns and is not rejected: validate it first.
 *
 * @example
 * ```typescript
 * export async function generateMetadata({ params }) {
 *   const { locale } = await params;
 *   if (!hasLocale(routing.locales, locale)) notFound();
 *   return { alternates: getAlternates(routing, { locale, href: '/admin' }) };
 * }
 * ```
 */
export function getAlternates<T extends string>(
  routing: Required<RoutingConfig<T>>,
  { locale, href }: GetPathnameOptions,
): Alternates {
  const { locales, defaultLocale, localePrefix, pathnames } = routing;
  const options = { defaultLocale, localePrefix, pathnames };

  if (!locales.includes(locale as T)) {
    console.warn(
      `[@comvi/next] getAlternates: unknown locale "${locale}". Expected one of: ${locales.join(", ")}`,
    );
  }

  const canonical = buildLocalizedPath(href, locale, options);
  // No URL belongs to one locale for every visitor: without `pathnames` one URL
  // serves each visitor's locale (cookie, Accept-Language). With them, a slug of
  // one locale answers in it to a visitor without a cookie, and the middleware
  // redirects a visitor whose cookie selects another locale to that locale's URL.
  if (localePrefix === "never") return { canonical };

  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = buildLocalizedPath(href, l, options);
  languages["x-default"] = languages[defaultLocale];
  return { canonical, languages };
}
