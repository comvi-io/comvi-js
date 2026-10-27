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
    expect(formatRelativeTime(i18n, -3, "day")).toBe("3 days ago");
    expect(formatRelativeTime(i18n, 1, "day", { numeric: "auto" })).toBe("tomorrow");
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
});
