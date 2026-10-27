/**
 * The one shared Intl cache, the plural count `#`, and what a plain `{x}` prints.
 *
 * A plain `{x}` prints `String(value)` for every type — a number, a Date, a string list
 * — with no Intl (owner decision R3-17, 28.10.2026), as 0.7, FormatJS, i18next and
 * vue-i18n do: `{orderId}` with 1004 prints `1004` and `{year}` with 2026 prints `2026`,
 * never `1,004` / `2,026`. A localized number or date is formatted in code with
 * `@comvi/core/format` and passed as a string. `#` in a plural sub-message is the one
 * value the compiler localizes (owner decision 11.10): {@link formatNumber}.
 *
 * There are no `{x, number|date|time}` arguments (design rev 3, R3-8).
 *
 * The cache is process-level and keyed by plain strings — never JSON.stringify on
 * the hot path (R4-7). Its content is a pure function of the key, so sharing it
 * across instances and requests leaks nothing; a size cap keeps an unbounded
 * stream of locales (a per-call `{ locale }` from user input) from growing it
 * without limit. `@comvi/core/format` and `#` share it.
 */

type IntlKind =
  | "NumberFormat"
  | "DateTimeFormat"
  | "ListFormat"
  | "PluralRules"
  | "RelativeTimeFormat"
  | "DisplayNames";

/** Formatters keyed by "<kind> <locale> <variant>". */
let cache: Record<string, object> = Object.create(null);
let size = 0;
/** Entries kept before the cache starts over. */
export const INTL_CACHE_LIMIT = 500;

/** Per-locale verdict of the output probe: does the locale print ASCII digits? */
let ascii: Record<string, boolean> = Object.create(null);

/**
 * The cached Intl formatter of `kind` for `locale`, built with `options` on first use.
 * `locales`, when given, is what the formatter is built for (a fallback list); `locale`
 * is then the list's cache key, joined once by the caller rather than on every call.
 */
export const intl = <T>(
  kind: IntlKind,
  locale: string,
  variant: string,
  options?: object,
  locales?: readonly string[],
): T => {
  const key = kind + " " + locale + " " + variant;
  let f = cache[key];
  if (f === undefined) {
    if (++size > INTL_CACHE_LIMIT) {
      cache = Object.create(null);
      ascii = Object.create(null);
      size = 1;
    }
    // The constructor is looked up by name on purpose: one call site for every kind.
    f = cache[key] = new (
      Intl[kind] as unknown as new (l: string | readonly string[], o?: object) => object
    )(locales || locale, options);
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

/** A value a binding renders itself: a function, or an object that is not a Date. */
const node = (v: unknown): boolean =>
  typeof v === "function" || (typeof v === "object" && !!v && !(v instanceof Date));

/**
 * The text a plain `{x}` prints for a value (R3-17): `String(value)` for a number, a Date,
 * a list of those or of strings (`[1, 2]` → `1,2`) and every other primitive, with no
 * Intl; functions, other objects (framework nodes) and a list holding one pass through
 * untouched so the binding can render them. Never re-parsed as message syntax.
 */
export const formatValue = (value: unknown): unknown =>
  node(value) && !(Array.isArray(value) && !value.some(node)) ? value : String(value);

/** Test seam: drop every cached formatter and probe verdict. */
export const _resetIntlCache = (): void => {
  cache = Object.create(null);
  ascii = Object.create(null);
  size = 0;
};

/** Test seam: how many formatters the cache holds. */
export const _intlCacheSize = (): number => size;
