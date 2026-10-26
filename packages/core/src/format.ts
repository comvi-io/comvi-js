/**
 * Standalone functions rather than `I18n` methods, so an app that never formats
 * does not carry this code in its bundle.
 */

/** Anything with a current locale — typically an I18n instance. */
export interface LocaleSource {
  locale: string;
  /** Tried in order after `locale` when the runtime has no data for it. */
  readonly fallbackLocales?: readonly string[];
}

// Bounded FIFO caches, shared across instances (Intl formatters are instance-independent).
const FORMATTER_CACHE_MAX = 1000;

function cachePut<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= FORMATTER_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

const validTags = new Map<string, boolean>();

// A fallback that is only a catalog key (`en_US`) must not make `Intl` throw.
function isValidTag(tag: string): boolean {
  let valid = validTags.get(tag);
  if (valid === undefined) {
    try {
      Intl.getCanonicalLocales(tag);
      valid = true;
    } catch {
      valid = false;
    }
    cachePut(validTags, tag, valid);
  }
  return valid;
}

/** The locales handed to `Intl`, and their JSON as the formatter cache-key prefix. */
type ResolvedLocales = [lc: string | string[], key: string];

const NO_CHAIN: readonly string[] = Object.freeze([]);

// Per chain array, per locale. Keyed by identity, so only a frozen chain is
// memoized: a mutable one could change under the entry. An I18n instance's
// chain is frozen and replaced whole by `setFallbackLocale`.
let resolvedCache = new WeakMap<readonly string[], Map<string, ResolvedLocales>>();

// An explicit `locale` argument is one locale; otherwise the source's chain.
function resolveLocales(source: LocaleSource, locale: string | undefined): ResolvedLocales {
  let chain = NO_CHAIN;
  if (locale === undefined) {
    locale = source.locale;
    chain = source.fallbackLocales ?? NO_CHAIN;
  }
  let byLocale = resolvedCache.get(chain);
  let resolved = byLocale?.get(locale);
  if (resolved === undefined) {
    const fallbacks = chain.filter(isValidTag);
    const lc = fallbacks.length ? [locale, ...fallbacks] : locale;
    resolved = [lc, JSON.stringify(lc)];
    if (Object.isFrozen(chain)) {
      if (byLocale === undefined) resolvedCache.set(chain, (byLocale = new Map()));
      cachePut(byLocale, locale, resolved);
    }
  }
  return resolved;
}

// The prefix is one complete JSON value, so appending the options' JSON stays unambiguous.
function cacheKey([, key]: ResolvedLocales, options: object | undefined): string {
  return options ? key + JSON.stringify(options) : key;
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();
const relativeTimeFormatCache = new Map<string, Intl.RelativeTimeFormat>();

function getNumberFormat(
  locales: ResolvedLocales,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = cacheKey(locales, options);
  return (
    numberFormatCache.get(key) ??
    cachePut(numberFormatCache, key, new Intl.NumberFormat(locales[0], options))
  );
}

function getDateFormat(
  locales: ResolvedLocales,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = cacheKey(locales, options);
  return (
    dateFormatCache.get(key) ??
    cachePut(dateFormatCache, key, new Intl.DateTimeFormat(locales[0], options))
  );
}

function getRelativeTimeFormat(
  locales: ResolvedLocales,
  options?: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat {
  const key = cacheKey(locales, options);
  return (
    relativeTimeFormatCache.get(key) ??
    cachePut(relativeTimeFormatCache, key, new Intl.RelativeTimeFormat(locales[0], options))
  );
}

/** Format a number. Uses the source locale, then its `fallbackLocales`, unless `locale` is passed. */
export function formatNumber(
  i18n: LocaleSource,
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: string,
): string {
  return getNumberFormat(resolveLocales(i18n, locale), options).format(value);
}

/** Format a date. Uses the source locale, then its `fallbackLocales`, unless `locale` is passed. */
export function formatDate(
  i18n: LocaleSource,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  return getDateFormat(resolveLocales(i18n, locale), options).format(value);
}

/** Format a number as currency. Uses the source locale, then its `fallbackLocales`, unless `locale` is passed. */
export function formatCurrency(
  i18n: LocaleSource,
  value: number,
  currency: string,
  options?: Intl.NumberFormatOptions,
  locale?: string,
): string {
  return getNumberFormat(resolveLocales(i18n, locale), {
    ...options,
    style: "currency",
    currency,
  }).format(value);
}

/** Format a relative time. Uses the source locale, then its `fallbackLocales`, unless `locale` is passed. */
export function formatRelativeTime(
  i18n: LocaleSource,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
  locale?: string,
): string {
  return getRelativeTimeFormat(resolveLocales(i18n, locale), options).format(value, unit);
}

const textDirectionCache = new Map<string, "ltr" | "rtl">();

/** @internal Test probe: entries across the formatter and text-direction caches. */
export function _formatterCacheSize(): number {
  return (
    numberFormatCache.size +
    dateFormatCache.size +
    relativeTimeFormatCache.size +
    textDirectionCache.size
  );
}

/** @internal Test teardown. */
export function _resetFormatterCaches(): void {
  resolvedCache = new WeakMap();
  numberFormatCache.clear();
  dateFormatCache.clear();
  relativeTimeFormatCache.clear();
  textDirectionCache.clear();
}

/**
 * Text direction for a locale, for an HTML `dir` attribute or CSS logical
 * properties. `Intl.Locale.textInfo` (ES2023+) is the authoritative source —
 * it handles script subtags and regional variants from CLDR — with the
 * hand-rolled script/language check below as the fallback on older runtimes.
 */
export function getTextDirection(locale: string): "ltr" | "rtl" {
  const cached = textDirectionCache.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  let result: "ltr" | "rtl";
  try {
    const info = (
      new Intl.Locale(locale) as Intl.Locale & {
        textInfo?: { direction?: string };
      }
    ).textInfo;
    if (info?.direction === "rtl" || info?.direction === "ltr") {
      return cachePut(textDirectionCache, locale, info.direction);
    }
  } catch {
    // Invalid locale — fall through to the hardcoded check
  }
  // An explicit RTL script subtag wins ("ku-Arab").
  if (/[-_](arab|hebr|thaa|syrc|nkoo|samr|mand|mend|rohg|adlm)([-_]|$)/i.test(locale)) {
    result = "rtl";
  } else if (/^[a-z]{2,3}[-_][a-z]{4}([-_]|$)/i.test(locale)) {
    // Any OTHER explicit script subtag means LTR ("ks-Deva", "ar-Latn").
    result = "ltr";
  } else {
    // No script subtag — fall back to the language code's default direction.
    result = /^(ar|arc|ckb|dv|fa|glk|he|khw|ks|lrc|mzn|pnb|ps|sd|syr|ug|ur|yi)([-_]|$)/i.test(
      locale,
    )
      ? "rtl"
      : "ltr";
  }
  return cachePut(textDirectionCache, locale, result);
}
