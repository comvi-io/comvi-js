/**
 * Value formatting for the message compiler and the one shared Intl cache.
 *
 * Every value a message prints is localized, exactly as ICU MessageFormat prints a
 * plain `{0}` argument: a number goes through the locale's default NumberFormat
 * (grouping, up to three fraction digits, the locale's digits), a Date through a
 * short date + short time DateTimeFormat in the instance time zone, a string[]
 * through ListFormat. `#` in a plural sub-message uses the same number formatter.
 *
 * There are no `{x, number|date|time}` arguments (design rev 3, R3-8): format such
 * values in code and pass the string as a plain `{x}`.
 *
 * The cache is process-level and keyed by plain strings — never JSON.stringify on
 * the hot path (R4-7). Its content is a pure function of the key, so sharing it
 * across instances and requests leaks nothing; a size cap keeps an unbounded
 * stream of locales (a per-call `{ locale }` from user input) from growing it
 * without limit.
 */

type IntlKind = "NumberFormat" | "DateTimeFormat" | "ListFormat" | "PluralRules";

/** Formatters keyed by "<kind> <locale> <variant>". */
let cache: Record<
  string,
  Intl.NumberFormat | Intl.DateTimeFormat | Intl.ListFormat | Intl.PluralRules
> = Object.create(null);
let size = 0;
/** Entries kept before the cache starts over. */
export const INTL_CACHE_LIMIT = 500;

/** Per-locale verdict of the output probe: does the locale print ASCII digits? */
let ascii: Record<string, boolean> = Object.create(null);

/** The cached Intl formatter of `kind` for `locale`, built with `options` on first use. */
export const intl = <T>(kind: IntlKind, locale: string, variant: string, options?: object): T => {
  const key = kind + " " + locale + " " + variant;
  let f = cache[key];
  if (f === undefined) {
    if (++size > INTL_CACHE_LIMIT) {
      cache = Object.create(null);
      ascii = Object.create(null);
      size = 1;
    }
    // The constructor is looked up by name on purpose: one call site for every kind.
    f = cache[key] = new (Intl[kind] as unknown as new (l: string, o?: object) => typeof f)(
      locale,
      options,
    );
  }
  return f as T;
};

const numberFormat = (locale: string): Intl.NumberFormat => intl("NumberFormat", locale, "");

/**
 * A number formatted for the locale. Non-negative integers below 1000 skip Intl when
 * the locale's actual output for 109 is "109" — a probe of the real output, cached
 * per locale, because `ar-EG`, `fa`, `bn`, `th-u-nu-thai`, `hi-u-nu-deva` print other
 * digits and no locale metadata reliably says so (R4-7).
 */
export const formatNumber = (n: number, locale: string): string =>
  n >= 0 &&
  n < 1000 &&
  n % 1 === 0 &&
  1 / n > 0 &&
  (ascii[locale] ??= numberFormat(locale).format(109) === "109")
    ? "" + n
    : numberFormat(locale).format(n);

/** Plural (or ordinal) rules for the locale. */
export const pluralRules = (locale: string, ordinal: boolean): Intl.PluralRules =>
  intl("PluralRules", locale, ordinal ? "o" : "", ordinal ? { type: "ordinal" } : undefined);

/**
 * The text a plain `{x}` prints for a value: number, Date and string[] are localized;
 * objects and functions (framework nodes) pass through untouched so the binding can
 * render them; every other primitive becomes its string; an invalid Date is `undefined`
 * (nothing to print). Never re-parsed as message syntax.
 */
export const formatValue = (value: unknown, locale: string, timeZone?: string): unknown =>
  typeof value === "number"
    ? formatNumber(value, locale)
    : value instanceof Date
      ? // An invalid Date has nothing to print (Intl would throw): the caller reports it
        // as a missing parameter.
        +value === +value
        ? intl<Intl.DateTimeFormat>("DateTimeFormat", locale, "" + timeZone, {
            dateStyle: "short",
            timeStyle: "short",
            timeZone,
          }).format(value)
        : undefined
      : Array.isArray(value) && value.every((v) => typeof v === "string")
        ? intl<Intl.ListFormat>("ListFormat", locale, "").format(value)
        : typeof value === "object" || typeof value === "function"
          ? value
          : String(value);

/** Test seam: drop every cached formatter and probe verdict. */
export const _resetIntlCache = (): void => {
  cache = Object.create(null);
  ascii = Object.create(null);
  size = 0;
};

/** Test seam: how many formatters the cache holds. */
export const _intlCacheSize = (): number => size;
