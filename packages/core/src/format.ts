/**
 * @comvi/core/format — Intl formatters for values a message should not format itself
 * (design §3.3; R3-8: no `{x, number|date|time}` in messages). Standalone functions, so
 * an app that never formats carries none of this; they share the message compiler's one
 * process-level Intl cache (fmt.ts), keyed by locale and normalized option VALUES —
 * never `JSON.stringify` on the hot path.
 *
 * Each takes the instance and formats in its locale chain (canonical; the app may spell
 * the locale `pt_BR`), or in `locale` alone when passed. Dates use the instance `timeZone` unless
 * the options name one.
 */
import { intl } from "./compile/fmt";
import { CORE, type I18n } from "./instance";
import { canonicalize } from "./locale";

/**
 * The Intl locales: `locale` alone when passed, else the instance's lookup chain (its
 * locale, the parents, the fallback locales), canonical — Intl takes the first it has
 * data for. A tag that does not canonicalize is left out. Memoized per chain array (the
 * instance memoizes chains per locale), so a call with no `locale` allocates nothing.
 */
const chains = new WeakMap<object, string | readonly string[]>();
const tags = (i18n: I18n, locale?: string): string | readonly string[] => {
  if (locale) return [canonicalize(locale)].filter((x): x is string => !!x);
  const c = CORE.get(i18n);
  if (!c) return [];
  const ch = c.ch(i18n.locale);
  let ls = chains.get(ch);
  // One locale goes as a string: the Intl cache key then needs no join.
  if (!ls) chains.set(ch, (ls = ch.length == 1 ? ch[0][1] : ch.map((x) => x[1])));
  return ls;
};

/** A cache variant for `options`: its own keys, sorted, with their values. */
const variant = (options?: object): string =>
  options
    ? Object.keys(options)
        .sort()
        .map((k) => k + "=" + (options as Record<string, unknown>)[k])
        .join(",")
    : "";

/** Date options with the instance time zone filled in. */
const zoned = <T extends { timeZone?: string }>(i18n: I18n, options?: T): T | undefined => {
  const z = CORE.get(i18n)?.z;
  return z && !(options && options.timeZone) ? ({ ...options, timeZone: z } as T) : options;
};

export const formatNumber = (
  i18n: I18n,
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: string,
): string =>
  intl<Intl.NumberFormat>("NumberFormat", tags(i18n, locale), variant(options), options).format(
    value,
  );

export const formatCurrency = (
  i18n: I18n,
  value: number,
  currency: string,
  options?: Intl.NumberFormatOptions,
  locale?: string,
): string => formatNumber(i18n, value, { ...options, style: "currency", currency }, locale);

export const formatDate = (
  i18n: I18n,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string => {
  const o = zoned(i18n, options);
  return intl<Intl.DateTimeFormat>("DateTimeFormat", tags(i18n, locale), variant(o), o).format(
    value,
  );
};

export const formatDateRange = (
  i18n: I18n,
  start: Date | number,
  end: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string => {
  const o = zoned(i18n, options);
  return intl<Intl.DateTimeFormat>("DateTimeFormat", tags(i18n, locale), variant(o), o).formatRange(
    start,
    end,
  );
};

export const formatRelativeTime = (
  i18n: I18n,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
  locale?: string,
): string =>
  intl<Intl.RelativeTimeFormat>(
    "RelativeTimeFormat",
    tags(i18n, locale),
    variant(options),
    options,
  ).format(value, unit);

export const formatList = (
  i18n: I18n,
  items: readonly string[],
  options?: Intl.ListFormatOptions,
  locale?: string,
): string =>
  intl<Intl.ListFormat>("ListFormat", tags(i18n, locale), variant(options), options).format(items);

/** The display name of a language, region, script or currency code, in the instance locale. */
export const displayName = (
  i18n: I18n,
  code: string,
  type: Intl.DisplayNamesOptions["type"] = "language",
  locale?: string,
): string | undefined =>
  intl<Intl.DisplayNames>("DisplayNames", tags(i18n, locale), type, { type }).of(code);
