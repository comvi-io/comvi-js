/**
 * @comvi/core/format — Intl formatters for values a message should not format itself
 * (design §3.3; R3-8: no `{x, number|date|time}` in messages). Standalone functions, so
 * an app that never formats carries none of this; they share the message compiler's one
 * process-level Intl cache (fmt.ts), keyed by locale and normalized option VALUES —
 * never `JSON.stringify` on the hot path.
 *
 * Each takes the instance and formats in its locale chain (canonical; the app may spell
 * the locale `pt_BR`), or in the chain of `locale` when passed (it, its parents, the
 * fallback locales — as `t()` resolves `{ locale }`); a `locale` that is not a tag throws a
 * `RangeError`, an `i18n` that is not an instance of `createI18n()` a `TypeError`. Dates use the instance `timeZone` unless
 * the options name one. `formatNumber` and `formatDate` also take the NAME of an entry of the
 * instance's `formats` option; `formatRelativeTime` counts from the instance's clock (see
 * clock.ts; a server's is serialised by `handover()` as `serverNow`, so the hydration
 * matches) unless its options pass a `now`.
 */
import { clock } from "./clock";
import { intl } from "./compile/fmt";
import { CORE, type I18n, type I18nOptions } from "./instance";
import { canonicalize } from "./locale";

/**
 * The Intl locales: the lookup chain (the locale, its parents, the fallback locales) of
 * `locale` when passed, else of the instance's locale, canonical — Intl takes the first it
 * has data for. A tag that does not canonicalize is left out. Memoized per chain array (the
 * instance memoizes chains per locale), so a call allocates nothing once its chain is seen.
 */
declare const __DEV__: boolean;

/** The instance behind `i18n`: formatters take a real one, anything else is a TypeError. */
const seam = (i18n: I18n) => {
  const core = CORE.get(i18n);
  if (!core) throw TypeError(__DEV__ ? "[@comvi/core] not an instance of createI18n()" : "i18n");
  return core;
};

type Tags = [key: string, locales: readonly string[], fmts: Record<string, unknown>];
const chains = new WeakMap<object, Tags>();
const tags = (i18n: I18n, locale?: string): Tags => {
  const core = seam(i18n);
  // An override that is not a tag is the caller's mistake, never the current locale.
  if (locale !== undefined && !canonicalize(locale))
    throw RangeError(__DEV__ ? `[@comvi/core] invalid locale "${locale}"` : locale);
  // An override formats in ITS chain, like `t()`'s `{ locale }`: a binding passes the locale
  // its render shows, which may differ from the instance's during a handover or hydration.
  const ch = core.ch(locale ?? i18n.locale);
  let t = chains.get(ch);
  if (!t) {
    const ls = ch.map((x) => x[1]);
    chains.set(ch, (t = [ls.join(), ls, Object.create(null)]));
  }
  return t;
};

/**
 * The cached formatter of `kind` for `i18n` (or `locale`) and `options`. A call with the
 * default options also keeps the formatter on the chain's memo, so the hot path skips the
 * shared cache's key building (the memo lives as long as the chain does).
 */
const get = <T>(
  kind: Parameters<typeof intl>[0],
  i18n: I18n,
  options: object | undefined,
  locale?: string,
  v = variant(options),
): T => {
  const t = tags(i18n, locale);
  if (options && options != AUTO) return intl<T>(kind, t[0], v, options, t[1]);
  const m = t[2];
  return (m[kind] ??= intl<T>(kind, t[0], v, options, t[1])) as T;
};

/** A cache variant for `options`: its own keys, sorted, with their values. */
const variant = (options?: object): string =>
  options
    ? Object.keys(options)
        .sort()
        .map((k) => k + "=" + (options as Record<string, unknown>)[k])
        .join(",")
    : "";

/** The instance options (`timeZone`, `now`, `formats`). */
const opts = (i18n: I18n): Partial<I18nOptions> => seam(i18n).o;

/** `options`, or the named entry of the instance's `formats[kind]` (unknown name: none). */
const named = <T>(i18n: I18n, kind: "number" | "date", options?: T | string): T | undefined =>
  typeof options == "string"
    ? ((opts(i18n).formats?.[kind] as Record<string, T> | undefined)?.[options] ?? undefined)
    : options;

/** Date options with the instance time zone filled in. */
const zoned = <T extends { timeZone?: string }>(i18n: I18n, options?: T): T | undefined => {
  const z = opts(i18n).timeZone;
  return z && !(options && options.timeZone) ? ({ ...options, timeZone: z } as T) : options;
};

/** A number; `options` may name an entry of the instance's `formats.number`. */
export const formatNumber = (
  i18n: I18n,
  value: number,
  options?: Intl.NumberFormatOptions | string,
  locale?: string,
): string =>
  get<Intl.NumberFormat>(
    "NumberFormat",
    i18n,
    named<Intl.NumberFormatOptions>(i18n, "number", options),
    locale,
  ).format(value);

export const formatCurrency = (
  i18n: I18n,
  value: number,
  currency: string,
  options?: Intl.NumberFormatOptions,
  locale?: string,
): string => formatNumber(i18n, value, { ...options, style: "currency", currency }, locale);

/** A date; `options` may name an entry of the instance's `formats.date`. */
export const formatDate = (
  i18n: I18n,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions | string,
  locale?: string,
): string => {
  const o = zoned(i18n, named<Intl.DateTimeFormatOptions>(i18n, "date", options));
  return get<Intl.DateTimeFormat>("DateTimeFormat", i18n, o, locale).format(value);
};

export const formatDateRange = (
  i18n: I18n,
  start: Date | number,
  end: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string => {
  const o = zoned(i18n, options);
  return get<Intl.DateTimeFormat>("DateTimeFormat", i18n, o, locale).formatRange(start, end);
};

const AUTO: Intl.RelativeTimeFormatOptions = { numeric: "auto" };

/** Units from the largest down, with their length in ms (a month is 30.44 days, a year 365.25). */
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31557600000],
  ["month", 2629800000],
  ["week", 604800000],
  ["day", 86400000],
  ["hour", 3600000],
  ["minute", 60000],
  ["second", 1000],
];

/** Options of `formatRelativeTime`: Intl's, and the `now` to count from. */
export interface RelativeTimeOptions extends Intl.RelativeTimeFormatOptions {
  /** Epoch ms to count from. Default: the instance's clock (clock.ts). */
  now?: number;
}

/**
 * `date` relative to `now` ("in 3 days", "yesterday"), in the largest unit that fits at
 * least once; `now` defaults to the instance's clock (clock.ts: its `now` option; the
 * `serverNow` a server handed over — a binding's `useFormat()` passes the browser's clock
 * as `now` for every render but a component's hydration; on a server the request's one
 * clock; in a browser the running clock). `numeric` defaults to `"auto"`. Nothing
 * re-renders when time moves on: a later render counts from the clock again.
 */
export const formatRelativeTime = (
  i18n: I18n,
  date: Date | number,
  options?: RelativeTimeOptions,
  locale?: string,
): string => {
  // Only `now` (or nothing): the default formatter, kept on the chain, no allocation. `now`
  // is not an Intl option: left out, so it never splits the formatter cache.
  let o: Intl.RelativeTimeFormatOptions = AUTO;
  for (const k in options)
    if (k != "now") {
      const { now: _, ...intlOptions } = options!;
      o = { numeric: AUTO.numeric, ...intlOptions };
      break;
    }
  const f = get<Intl.RelativeTimeFormat>(
    "RelativeTimeFormat",
    i18n,
    o,
    locale,
    // The default options' cache variant is a constant: no key sorting per call.
    o == AUTO ? "numeric=auto" : undefined,
  );
  // After `get()`: the clock takes a real instance.
  const ms = +date - (options?.now ?? clock(i18n));
  const [unit, size] = UNITS.find((u) => Math.abs(ms) >= u[1]) || UNITS[6];
  return f.format(Math.round(ms / size), unit);
};

export const formatList = (
  i18n: I18n,
  items: readonly string[],
  options?: Intl.ListFormatOptions,
  locale?: string,
): string => get<Intl.ListFormat>("ListFormat", i18n, options, locale).format(items);

/** The display name of a language, region, script or currency code, in the instance locale. */
export const displayName = (
  i18n: I18n,
  code: string,
  type: Intl.DisplayNamesOptions["type"] = "language",
  locale?: string,
): string | undefined => get<Intl.DisplayNames>("DisplayNames", i18n, { type }, locale).of(code);
