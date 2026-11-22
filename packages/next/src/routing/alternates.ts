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
 * locale and, per locale, the hreflang URL, built exactly like `<Link>` and
 * `getPathname`. Returns paths: set `metadataBase` in the root layout, or Next
 * leaves them relative.
 *
 * @example
 * ```typescript
 * export async function generateMetadata({ params }) {
 *   const { locale } = await params;
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
  // One URL for every locale: there is nothing for hreflang to tell apart.
  if (localePrefix === "never") return { canonical };

  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = buildLocalizedPath(href, l, options);
  languages["x-default"] = languages[defaultLocale];
  return { canonical, languages };
}
