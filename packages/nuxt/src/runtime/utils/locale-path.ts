/**
 * Shared utilities for locale path manipulation
 */

/**
 * Extract locale code from the first segment of a URL path.
 *
 * @example
 * extractLocaleFromPath('/de/about', ['en', 'de']) // 'de'
 * extractLocaleFromPath('/about', ['en', 'de'])    // undefined
 * extractLocaleFromPath('/ensemble', ['en', 'de']) // undefined
 */
export function extractLocaleFromPath(
  pathname: string,
  locales: readonly string[],
): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  return firstSegment !== undefined && locales.includes(firstSegment) ? firstSegment : undefined;
}

/**
 * Strip locale prefix from a path
 *
 * Safely handles edge cases like /ensemble not being affected when locale is "en"
 *
 * @param pathname - The path to clean
 * @param locales - List of valid locale codes
 * @returns Path without locale prefix
 *
 * @example
 * stripLocalePrefix('/de/about', ['en', 'de']) // '/about'
 * stripLocalePrefix('/de', ['en', 'de']) // '/'
 * stripLocalePrefix('/ensemble', ['en', 'de']) // '/ensemble' (not affected)
 */
export function stripLocalePrefix(pathname: string, locales: readonly string[]): string {
  for (const locale of locales) {
    // Check if path equals /{locale}
    if (pathname === `/${locale}`) {
      return "/";
    }

    // Check if path starts with /{locale}/
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1) || "/";
    }
  }

  return pathname;
}

/**
 * Split a full path into pathname and query/hash suffix
 */
export function splitPathAndSuffix(path: string): { pathname: string; suffix: string } {
  const match = path.match(/[?#]/);
  if (!match || match.index === undefined) {
    return { pathname: path, suffix: "" };
  }
  return { pathname: path.slice(0, match.index), suffix: path.slice(match.index) };
}

/**
 * Build a localized path based on prefix mode.
 *
 * Preserves trailing slashes: if the input ends with "/" the output will too.
 *
 * @param path - Clean path (without locale prefix)
 * @param locale - Target locale
 * @param defaultLocale - Default locale code
 * @param localePrefix - Prefix mode ('always' | 'as-needed' | 'never')
 * @returns Localized path
 */
export function buildLocalizedPath(
  path: string,
  locale: string,
  defaultLocale: string,
  localePrefix: "always" | "as-needed" | "never",
): string {
  // Normalize path to start with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Detect trailing slash on non-root paths (e.g. /about/ but not /)
  const hasTrailingSlash = normalizedPath.length > 1 && normalizedPath.endsWith("/");

  const needsPrefix =
    localePrefix === "always" || (localePrefix === "as-needed" && locale !== defaultLocale);

  if (!needsPrefix) {
    return normalizedPath;
  }

  if (normalizedPath === "/") {
    return `/${locale}`;
  }

  const prefixed = `/${locale}${normalizedPath}`;

  // Preserve trailing slash if present in the original path
  if (hasTrailingSlash && !prefixed.endsWith("/")) {
    return `${prefixed}/`;
  }

  return prefixed;
}
