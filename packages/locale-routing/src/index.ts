/**
 * locale-routing — framework-neutral locale routing primitives.
 *
 * Workspace-private: this source is inlined into @comvi/next at build time and
 * vendored into @comvi/nuxt's runtime. Nothing published names it, which is why
 * the doc comments below do not spell the workspace package name either.
 *
 * Zero dependencies, pure functions, no `node:`/`url` imports — framework
 * couplings (e.g. Next's `UrlObject`) stay in framework-side adapters.
 *
 * Semantics:
 * - Locale matching is SEGMENT-based: `/ensemble` never matches `en`.
 * - Trailing slashes are PRESERVED: `/de/` → `/`, `/de/about/` → `/about/`.
 * - Inputs are normalized to a leading slash; interior bytes are never rewritten.
 * - `Accept-Language` has ONE matcher, {@link resolveAcceptLanguage}, shared by
 *   every integration; its rules are written out at the function.
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
   * `path` argument first; if that misses, by the same path with duplicate
   * slashes collapsed and a single trailing slash split off, so `"/about/"`
   * and `"//about"` still find `"/about"`'s slug. A leading slash is never
   * added for the lookup (`"about"` is not `"/about"`).
   */
  pathnames?: PathnamesMap;
}

/**
 * Match an `Accept-Language` header against the configured locales.
 *
 * THE one implementation. Every integration resolves the header through this
 * function — next imports it, nuxt vendors it — because two copies of these
 * twenty lines is what let `q=0` be honoured in one framework and ignored in
 * the other for a whole release. `tooling/test-utils/acceptLanguageTable.ts`
 * holds the input table that all of them assert; the rules it pins are:
 *
 * 1. **Parsing.** Entries split on `,` and are trimmed. The language tag is
 *    everything before the first `;`. Only the FIRST parameter after the tag is
 *    examined for a quality value, and its text is read with `parseFloat`;
 *    anything absent or unparseable (`;q=`, a bare `;q`, `;q=abc`, or no
 *    parameter at all) means q = 1, the most preferred. The parameter's NAME is
 *    not checked, so `;level=1` is read as the q value and `;Q=0.5` works.
 * 2. **Refusals are dropped, not ranked last.** `q=0` means "not acceptable"
 *    (RFC 9110 §12.4.2), so a refused entry is removed before matching; sorting
 *    alone still let `fr;q=0` win when it was the only entry matching a
 *    configured locale. Negative q is refused the same way. An entry with an
 *    empty tag (a stray comma) can match nothing and goes too.
 * 3. **Order.** Remaining entries are sorted by descending q with a stable
 *    sort, so ties keep the order the client wrote them in.
 * 4. **Matching.** Each tag in that order is tried against `locales` IN
 *    CONFIGURATION ORDER, three ways, and the first hit wins outright:
 *    an exact case-insensitive match; then the tag's base language against a
 *    whole locale (`en-US` → `en`); then a configured locale under that base
 *    language (`en` → `en-US`). A later, better-matching entry never overrides
 *    an earlier entry's weaker match.
 * 5. **No weighing beyond that.** Script and region subtags are not scored:
 *    with `["zh-Hant-TW", "zh-Hans"]`, `zh-Hans-CN` resolves to `zh-Hant-TW`
 *    because that is the first locale under base `zh`.
 * 6. **`*` is not expanded.** It names no configured locale, so it matches
 *    nothing and the next entry is tried.
 * 7. **The CONFIGURED spelling comes back**, never the header's: `pt-br`
 *    against `["pt-BR"]` returns `pt-BR`. `undefined` means no configured
 *    locale is acceptable — each caller decides what to do with that, and the
 *    frameworks differ (next's middleware falls back to `defaultLocale`).
 *
 * Known limitation, shared by every caller by construction: because only the
 * first parameter is read (rule 1), a header that puts another parameter before
 * `q` — `en;level=1;q=0.5` — is treated as q = 1. Real browsers do not send
 * that shape. It is one implementation's limitation now rather than two.
 *
 * @example
 * resolveAcceptLanguage('en-US,fr;q=0.5', ['en', 'fr']) // 'en'
 * resolveAcceptLanguage('fr;q=0', ['en', 'fr'])         // undefined
 */
export function resolveAcceptLanguage(
  acceptLanguage: string,
  locales: readonly string[],
): string | undefined {
  const entries = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag, firstParam] = entry.trim().split(";");
      // `String()` is what carries an absent parameter into the `isNaN`
      // backstop below, so that backstop is the single source of the
      // "most preferred" default rather than one of two fallbacks.
      const quality = parseFloat(String(firstParam?.split("=")[1]));
      return { tag: tag.trim(), quality: isNaN(quality) ? 1 : quality };
    })
    .filter(({ tag, quality }) => tag.length > 0 && quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of entries) {
    const normalizedTag = tag.toLowerCase();

    const exactMatch = locales.find((locale) => locale.toLowerCase() === normalizedTag);
    if (exactMatch) return exactMatch;

    const baseLang = normalizedTag.split("-")[0];
    const baseMatch = locales.find((locale) => locale.toLowerCase() === baseLang);
    if (baseMatch) return baseMatch;

    const prefixMatch = locales.find((locale) => locale.toLowerCase().startsWith(baseLang + "-"));
    if (prefixMatch) return prefixMatch;
  }

  return undefined;
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
 * Look up one path in the `pathnames` map.
 *
 * The exact key wins. Failing that, the same path with duplicate slashes
 * collapsed and a single trailing slash split off is tried, and the trailing
 * slash is re-appended to whatever the map returned: a cosmetic-slash variant
 * of a URL (`"/about/"`, `"//about"`) must not silently bypass the slug map,
 * while the trailing slash this package promises to preserve survives the
 * round trip. The lookup key never gains a LEADING slash — `"about"` is not
 * `"/about"`, which is next's pinned behaviour.
 */
const slashKey = (path: string): { key: string; hasTrailingSlash: boolean } => {
  const collapsed = path.includes("//") ? path.replace(/\/{2,}/g, "/") : path;
  const hasTrailingSlash = collapsed.length > 1 && collapsed.endsWith("/");
  return { key: hasTrailingSlash ? collapsed.slice(0, -1) : collapsed, hasTrailingSlash };
};

function lookupPathname(path: string, locale: string, pathnames: PathnamesMap): string | undefined {
  const exact = pathnames[path]?.[locale];
  if (exact !== undefined) return exact;

  const { key, hasTrailingSlash } = slashKey(path);
  // The map's own keys go through the same trimming, so a key written as
  // `"/about/"` still matches `/about` and `//about`.
  let mapped: string | undefined = pathnames[key]?.[locale];
  if (mapped === undefined) {
    for (const [mapKey, byLocale] of Object.entries(pathnames)) {
      if (mapKey !== path && slashKey(mapKey).key === key) {
        mapped = byLocale[locale];
        if (mapped !== undefined) break;
      }
    }
  }
  if (mapped === undefined) return undefined;
  return hasTrailingSlash && !mapped.endsWith("/") ? `${mapped}/` : mapped;
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

  const mapped = (pathnames && lookupPathname(path, locale, pathnames)) ?? path;
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
