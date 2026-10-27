/**
 * @comvi/core/format — Intl formatters over the shared cache.
 * Ported by meaning from 0.7: formatting-locale-override, formatting-fallback-chain,
 * formatter-cache-key-options (instance half).
 */
import { describe, expect, it } from "vitest";
import { _intlCacheSize } from "../../src/compile/fmt";
import {
  displayName,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatList,
  formatNumber,
  formatRelativeTime,
} from "../../src/format";
import { createI18n } from "../../src/instance";

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
    // An explicit locale stays one locale, without the chain.
    expect(formatNumber(i18n, 1234.5, undefined, "en")).toBe("1,234.5");
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

describe("formatRelativeTime(i18n, date, now?) — design §3.3", () => {
  const DAY = 86_400_000;

  it("picks the largest unit that fits and counts from the explicit `now`", () => {
    const i18n = createI18n({ locale: "en" });
    expect(formatRelativeTime(i18n, D - 3 * DAY, D)).toBe("3 days ago");
    expect(formatRelativeTime(i18n, D + DAY, D)).toBe("tomorrow");
    expect(formatRelativeTime(i18n, D - DAY, D)).toBe("yesterday");
    expect(formatRelativeTime(i18n, D + 2 * 3_600_000, D)).toBe("in 2 hours");
    expect(formatRelativeTime(i18n, D - 120_000, D)).toBe("2 minutes ago");
    expect(formatRelativeTime(i18n, D + 14 * DAY, D)).toBe("in 2 weeks");
    expect(formatRelativeTime(i18n, D - 400 * DAY, D)).toBe("last year");
    expect(formatRelativeTime(i18n, new Date(D), D)).toBe("now");
    expect(formatRelativeTime(i18n, D + 2 * DAY, D, { numeric: "always" })).toBe("in 2 days");
    expect(formatRelativeTime(i18n, D + 2 * DAY, D, undefined, "de")).toBe("übermorgen");
  });

  it("defaults `now` to the instance's `now` option (SSR: server and client agree)", () => {
    const server = createI18n({ locale: "en", now: D });
    const client = createI18n({ locale: "en", now: D });
    expect(formatRelativeTime(server, D - 5 * DAY)).toBe("5 days ago");
    expect(formatRelativeTime(client, D - 5 * DAY)).toBe(formatRelativeTime(server, D - 5 * DAY));
  });

  it("without a `now` anywhere it counts from the clock", () => {
    const i18n = createI18n({ locale: "en" });
    expect(formatRelativeTime(i18n, Date.now() - 3 * DAY)).toBe("3 days ago");
  });
});
