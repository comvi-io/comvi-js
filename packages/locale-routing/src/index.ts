/**
 * @comvi/locale-routing — framework-neutral locale routing primitives.
 *
 * Zero dependencies, pure functions, no `node:`/`url` imports — framework
 * couplings (e.g. Next's `UrlObject`) stay in framework-side adapters.
 *
 * Semantics:
 * - Locale matching is SEGMENT-based: `/ensemble` never matches `en`.
 * - Trailing slashes are PRESERVED: `/de/` → `/`, `/de/about/` → `/about/`.
 * - Inputs are normalized to a leading slash; interior bytes are never rewritten.
 */

/** Locale prefix strategy shared by all Comvi framework integrations. */
export type LocalePrefixMode = "always" | "as-needed" | "never";

/**
 * Locale-specific slug overrides per canonical path,
 * e.g. `{ "/about": { de: "/ueber-uns" } }`.
 */
export type PathnamesMap = Record<string, Record<string, string | undefined>>;

/** Options for {@link buildLocalizedPath}. */
export interface BuildLocalizedPathOptions {
  /** Default locale code (left unprefixed in `"as-needed"` mode). */
  defaultLocale: string;
  localePrefix: LocalePrefixMode;
  /**
   * Optional canonical-path → per-locale slug map. Looked up by the exact
   * `path` argument BEFORE normalization or prefixing.
   */
  pathnames?: PathnamesMap;
}

/**
 * Extract the locale code from the first segment of a URL path.
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
 * Strip the locale prefix from a path.
 *
 * Segment-based matching (`/ensemble` is never affected by locale `en`) with
 * trailing-slash preservation (`/de/about/` → `/about/`, `/de/` → `/`).
 * Only the first segment is ever removed; the remainder of the path is
 * returned byte-for-byte.
 *
 * @example
 * stripLocalePrefix('/de/about', ['en', 'de'])  // '/about'
 * stripLocalePrefix('/de', ['en', 'de'])        // '/'
 * stripLocalePrefix('/de/about/', ['en', 'de']) // '/about/'
 * stripLocalePrefix('/ensemble', ['en', 'de'])  // '/ensemble'
 */
export function stripLocalePrefix(pathname: string, locales: readonly string[]): string {
  const normalized = pathname === "" || pathname.startsWith("/") ? pathname || "/" : `/${pathname}`;
  const segments = normalized.split("/").filter(Boolean);
  const first = segments[0];

  if (first === undefined || !locales.includes(first)) {
    return normalized;
  }

  // Segment match must sit at the very start of the path ("/de" or "/de/…");
  // anything else (e.g. "//de/about") is left untouched.
  if (normalized !== `/${first}` && !normalized.startsWith(`/${first}/`)) {
    return normalized;
  }

  const rest = normalized.slice(first.length + 1);
  return rest === "" ? "/" : rest;
}

/**
 * Split a full path into pathname and query/hash suffix (split at the first
 * `?` or `#`).
 */
export function splitPathAndSuffix(path: string): { pathname: string; suffix: string } {
  const match = path.match(/[?#]/);
  if (!match || match.index === undefined) {
    return { pathname: path, suffix: "" };
  }
  return { pathname: path.slice(0, match.index), suffix: path.slice(match.index) };
}

/**
 * Set one query parameter while preserving unrelated query segments and the
 * hash. Duplicate occurrences of the target parameter are collapsed to one
 * value; malformed unrelated segments are preserved verbatim.
 */
export function setQueryParamInSuffix(suffix: string, key: string, value: string): string {
  const hashIndex = suffix.indexOf("#");
  const hash = hashIndex >= 0 ? suffix.slice(hashIndex) : "";
  const queryWithPrefix = hashIndex >= 0 ? suffix.slice(0, hashIndex) : suffix;
  const rawQuery = queryWithPrefix.startsWith("?") ? queryWithPrefix.slice(1) : "";
  const encodedKey = encodeURIComponent(key);
  const encodedValue = encodeURIComponent(value);
  const segments = rawQuery ? rawQuery.split("&") : [];
  const updatedSegments: string[] = [];
  let replaced = false;

  for (const segment of segments) {
    const separatorIndex = segment.indexOf("=");
    const rawKey = separatorIndex >= 0 ? segment.slice(0, separatorIndex) : segment;
    let decodedKey: string | undefined;

    try {
      decodedKey = decodeURIComponent(rawKey.replace(/\+/g, " "));
    } catch {
      // Preserve malformed unrelated query segments verbatim.
    }

    if (decodedKey === key) {
      if (!replaced) {
        updatedSegments.push(`${encodedKey}=${encodedValue}`);
        replaced = true;
      }
      continue;
    }

    updatedSegments.push(segment);
  }

  if (!replaced) {
    updatedSegments.push(`${encodedKey}=${encodedValue}`);
  }

  return `?${updatedSegments.join("&")}${hash}`;
}

/**
 * Build a localized path: optional pathnames-map slug lookup, leading-slash
 * normalization, then locale prefixing per {@link LocalePrefixMode}.
 *
 * Trailing slashes are preserved on non-root paths; the prefixed root is
 * always `/{locale}` (no trailing slash).
 *
 * @param path - Clean canonical path (without locale prefix)
 */
export function buildLocalizedPath(
  path: string,
  locale: string,
  options: BuildLocalizedPathOptions,
): string {
  const { defaultLocale, localePrefix, pathnames } = options;

  const mapped = pathnames?.[path]?.[locale] ?? path;
  const normalizedPath = mapped === "" || mapped.startsWith("/") ? mapped || "/" : `/${mapped}`;

  const needsPrefix =
    localePrefix === "always" || (localePrefix === "as-needed" && locale !== defaultLocale);

  if (!needsPrefix) {
    return normalizedPath;
  }

  if (normalizedPath === "/") {
    return `/${locale}`;
  }

  return `/${locale}${normalizedPath}`;
}
