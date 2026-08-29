/**
 * Standalone functions rather than `I18n` methods, so an app that never formats
 * does not carry this code in its bundle.
 */

/** Anything with a current locale — typically an I18n instance. */
export interface LocaleSource {
  locale: string;
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

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();
const relativeTimeFormatCache = new Map<string, Intl.RelativeTimeFormat>();

function getNumberFormat(lc: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = JSON.stringify([lc, options ?? null]);
  return (
    numberFormatCache.get(cacheKey) ??
    cachePut(numberFormatCache, cacheKey, new Intl.NumberFormat(lc, options))
  );
}

function getDateFormat(lc: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = JSON.stringify([lc, options ?? null]);
  return (
    dateFormatCache.get(cacheKey) ??
    cachePut(dateFormatCache, cacheKey, new Intl.DateTimeFormat(lc, options))
  );
}

function getRelativeTimeFormat(
  lc: string,
  options?: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat {
  const cacheKey = JSON.stringify([lc, options ?? null]);
  return (
    relativeTimeFormatCache.get(cacheKey) ??
    cachePut(relativeTimeFormatCache, cacheKey, new Intl.RelativeTimeFormat(lc, options))
  );
}

/** Format a number. Uses the instance locale unless `locale` is passed. */
export function formatNumber(
  i18n: LocaleSource,
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: string,
): string {
  return getNumberFormat(locale ?? i18n.locale, options).format(value);
}

/** Format a date. Uses the instance locale unless `locale` is passed. */
export function formatDate(
  i18n: LocaleSource,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  return getDateFormat(locale ?? i18n.locale, options).format(value);
}

/** Format a number as currency. Uses the instance locale unless `locale` is passed. */
export function formatCurrency(
  i18n: LocaleSource,
  value: number,
  currency: string,
  options?: Intl.NumberFormatOptions,
  locale?: string,
): string {
  return getNumberFormat(locale ?? i18n.locale, { ...options, style: "currency", currency }).format(
    value,
  );
}

/** Format a relative time. Uses the instance locale unless `locale` is passed. */
export function formatRelativeTime(
  i18n: LocaleSource,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
  locale?: string,
): string {
  return getRelativeTimeFormat(locale ?? i18n.locale, options).format(value, unit);
}

const textDirectionCache = new Map<string, "ltr" | "rtl">();

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
