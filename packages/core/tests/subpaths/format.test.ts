/**
 * @comvi/core/format — Intl formatters over the shared cache.
 * Ported by meaning from 0.7: formatting-locale-override, formatting-fallback-chain,
 * formatter-cache-key-options (instance half).
 */
import { describe, expect, it, vi } from "vitest";
import { _intlCacheSize, _resetIntlCache, formatNumber as hash } from "../../src/compile/fmt";
import {
  displayName,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatList,
  formatNumber,
  formatRelativeTime,
} from "../../src/format";
import { createI18n, type I18n } from "../../src/instance";

/** Intl prints NBSP / narrow NBSP / thin spaces; compare with plain spaces. */
const sp = (s: string) => s.replace(/[\u00a0\u202f\u2009]/g, " ");

const D = Date.UTC(2026, 0, 5, 14, 7, 9);

describe("formatters", () => {
  it("format in the instance locale, follow a switch, and take an explicit locale", async () => {
    const i18n = createI18n({ locale: "de" });
    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
    expect(formatNumber(i18n, 1234.5, undefined, "en")).toBe("1,234.5");
    await i18n.setLocale("en");
    expect(formatNumber(i18n, 1234.5)).toBe("1,234.5");
    expect(formatCurrency(i18n, 3, "EUR")).toBe("€3.00");
    expect(sp(formatCurrency(i18n, 3, "EUR", undefined, "de"))).toBe("3,00 €");
    expect(formatList(i18n, ["a", "b", "c"])).toBe("a, b, and c");
    expect(formatList(i18n, ["a", "b"], { type: "disjunction" })).toBe("a or b");
    expect(displayName(i18n, "de")).toBe("German");
    expect(displayName(i18n, "UA", "region")).toBe("Ukraine");
  });

  it("an override that is not a locale formats in the instance chain, never the host default", () => {
    const i18n = createI18n({ locale: "de", onError: () => {} });
    expect(formatNumber(i18n, 1234.5, undefined, "!!")).toBe("1.234,5");
  });

  it("dates use the instance time zone unless the options name one", () => {
    const i18n = createI18n({ locale: "en", timeZone: "Asia/Tokyo" });
    expect(formatDate(i18n, D, { hour: "numeric", hourCycle: "h23" })).toBe("23");
    expect(formatDate(i18n, D, { hour: "numeric", hourCycle: "h23", timeZone: "UTC" })).toBe("14");
    expect(sp(formatDateRange(i18n, D, D + 86_400_000, { day: "numeric", month: "short" }))).toBe(
      "Jan 5 – 6",
    );
  });

  it("an app spelling with an underscore is canonicalized for Intl", () => {
    const i18n = createI18n({ locale: "pt_BR" });
    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
  });

  it("walks the instance chain when the runtime lacks the locale (Intl takes the first it has)", () => {
    const i18n = createI18n({ locale: "xx", fallbackLocale: "de" });
    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
    // An explicit locale formats in ITS chain: first itself, when Intl has it.
    expect(formatNumber(i18n, 1234.5, undefined, "en")).toBe("1,234.5");
  });

  it("an explicit locale the runtime lacks walks ITS chain, like t({ locale }) — not the host default (lot 4d)", () => {
    const i18n = createI18n({ locale: "fr", fallbackLocale: "de" });
    // fr's chain would give "1 234,5"; the host default "1,234.5"; xx's chain is xx → de.
    expect(formatNumber(i18n, 1234.5, undefined, "xx")).toBe("1.234,5");
    expect(sp(formatCurrency(i18n, 3, "EUR", undefined, "xx"))).toBe("3,00 €");
  });

  it("caches one formatter per (kind, locales, option values), whatever the object identity", () => {
    const i18n = createI18n({ locale: "en" });
    formatNumber(i18n, 1, { maximumFractionDigits: 2, style: "percent" });
    const n = _intlCacheSize();
    formatNumber(i18n, 2, { style: "percent", maximumFractionDigits: 2 });
    expect(_intlCacheSize()).toBe(n);
    formatNumber(i18n, 2, { style: "percent", maximumFractionDigits: 3 });
    expect(_intlCacheSize()).toBe(n + 1);
  });

  it("named formats come from the instance's `formats` option", () => {
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      formats: {
        number: { pct: { style: "percent" } },
        date: { short: { month: "short", day: "numeric" } },
      },
    });
    expect(formatNumber(i18n, 0.25, "pct")).toBe("25%");
    expect(formatDate(i18n, D, "short")).toBe("Jan 5");
    // An unknown name formats with the defaults.
    expect(formatNumber(i18n, 1234.5, "nope")).toBe("1,234.5");
    expect(formatNumber(createI18n({ locale: "en" }), 0.5, "pct")).toBe("0.5");
  });
});

describe("formatRelativeTime(i18n, date, { now }?) — design §3.3, lot 4b", () => {
  const DAY = 86_400_000;

  it("picks the largest unit that fits and counts from the explicit `now`", () => {
    const i18n = createI18n({ locale: "en" });
    expect(formatRelativeTime(i18n, D - 3 * DAY, { now: D })).toBe("3 days ago");
    expect(formatRelativeTime(i18n, D + DAY, { now: D })).toBe("tomorrow");
    expect(formatRelativeTime(i18n, D - DAY, { now: D })).toBe("yesterday");
    expect(formatRelativeTime(i18n, D + 2 * 3_600_000, { now: D })).toBe("in 2 hours");
    expect(formatRelativeTime(i18n, D - 120_000, { now: D })).toBe("2 minutes ago");
    expect(formatRelativeTime(i18n, D + 14 * DAY, { now: D })).toBe("in 2 weeks");
    expect(formatRelativeTime(i18n, D - 400 * DAY, { now: D })).toBe("last year");
    expect(formatRelativeTime(i18n, new Date(D), { now: D })).toBe("now");
    expect(formatRelativeTime(i18n, D + 2 * DAY, { now: D, numeric: "always" })).toBe("in 2 days");
    expect(formatRelativeTime(i18n, D + 2 * DAY, { now: D }, "de")).toBe("übermorgen");
  });

  it("defaults `now` to the instance's `now` option (SSR: server and client agree)", () => {
    const server = createI18n({ locale: "en", now: D });
    const client = createI18n({ locale: "en", now: D });
    expect(formatRelativeTime(server, D - 5 * DAY)).toBe("5 days ago");
    expect(formatRelativeTime(client, D - 5 * DAY)).toBe(formatRelativeTime(server, D - 5 * DAY));
  });

  it("`now` is not an Intl option: two `now`s share one formatter", () => {
    const i18n = createI18n({ locale: "en" });
    const spy = vi.spyOn(Intl, "RelativeTimeFormat");
    formatRelativeTime(i18n, D - DAY, { now: D, style: "short" });
    formatRelativeTime(i18n, D - DAY, { now: D + 1, style: "short" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("without a `now` anywhere it counts from the clock", () => {
    const i18n = createI18n({ locale: "en" });
    expect(formatRelativeTime(i18n, Date.now() - 3 * DAY)).toBe("3 days ago");
  });
});

describe("one formatter per locale for `#` and @comvi/core/format", () => {
  it("formatNumber() with default options and a plural `#` share the cached formatter", () => {
    const i18n = createI18n({ locale: "de" });
    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
    expect(_intlCacheSize()).toBe(1);
    expect(hash(5000, "de")).toBe("5.000");
    expect(_intlCacheSize()).toBe(1);
  });
});

describe("the formatter memo of a chain", () => {
  it("a call with default options builds no chain key once warm (counted work)", () => {
    const i18n = createI18n({ locale: "de", fallbackLocale: "en" });
    formatNumber(i18n, 1);
    const map = vi.spyOn(Array.prototype, "map");
    const join = vi.spyOn(Array.prototype, "join");
    for (let k = 0; k < 10; k++) formatNumber(i18n, k);
    expect([map.mock.calls.length, join.mock.calls.length]).toEqual([0, 0]);
  });

  it("keeps the default-options formatters on the chain: no new Intl object after the shared cache drops", () => {
    const i18n = createI18n({ locale: "en" });
    const DAY = 86_400_000;
    formatNumber(i18n, 1);
    formatRelativeTime(i18n, D + DAY, { now: D });
    _resetIntlCache();
    const nf = vi.spyOn(Intl, "NumberFormat");
    const rtf = vi.spyOn(Intl, "RelativeTimeFormat");
    expect(formatNumber(i18n, 1234)).toBe("1,234");
    expect(formatRelativeTime(i18n, D + DAY, { now: D })).toBe("tomorrow");
    expect([nf.mock.calls.length, rtf.mock.calls.length]).toEqual([0, 0]);
  });
});

describe("cache variants of option objects", () => {
  it("never let two option objects that format differently share a formatter", () => {
    const i18n = createI18n({ locale: "en" });
    // Intl ignores unknown option names, so these differ only in what the key encodes.
    expect(formatNumber(i18n, 0.5, { minimumFractionDigits: 2 })).toBe("0.50");
    expect(formatNumber(i18n, 0.5, { minimumFractionDigit: "s2" } as never)).toBe("0.5");
    expect(formatNumber(i18n, 0.5, { a: 1, style: "percent" } as never)).toBe("50%");
    expect(formatNumber(i18n, 0.5, { a: "1style=percent" } as never)).toBe("0.5");
  });

  it("relative time: explicit options never reuse the default `numeric: auto` formatter", () => {
    const i18n = createI18n({ locale: "en" });
    const DAY = 86_400_000;
    expect(formatRelativeTime(i18n, D + DAY, { now: D })).toBe("tomorrow");
    expect(formatRelativeTime(i18n, D + DAY, { now: D, numeric: "always" })).toBe("in 1 day");
    // Options without `numeric` keep the `auto` default.
    expect(formatRelativeTime(i18n, D + DAY, { now: D, style: "short" })).toBe("tomorrow");
  });
});

describe("an object that is not an instance", () => {
  it("formats in the runtime's default locale instead of throwing", () => {
    const fake = {} as I18n;
    expect(formatNumber(fake, 1234.5)).toBe(new Intl.NumberFormat().format(1234.5));
    // No instance options either: no time zone, no named formats, the clock as `now`.
    expect(formatDate(fake, D)).toBe(new Intl.DateTimeFormat().format(D));
    expect(formatNumber(fake, 0.5, "pct")).toBe(new Intl.NumberFormat().format(0.5));
    expect(formatRelativeTime(fake, Date.now() - 3 * 86_400_000)).toBe(
      new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-3, "day"),
    );
    expect(formatRelativeTime(fake, D - 86_400_000, { now: D })).toBe(
      new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-1, "day"),
    );
  });
});
