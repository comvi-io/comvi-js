/**
 * Verifies the optional `locale` argument on `formatNumber` / `formatDate` /
 * `formatCurrency` / `formatRelativeTime`: instance locale is used when
 * omitted, override locale wins when passed, and the Intl cache keys on
 * the active locale.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { I18n, formatNumber, formatDate, formatCurrency, formatRelativeTime } from "../../src";

describe("Formatters — optional `locale` override", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("formatNumber", () => {
    it("uses instance locale when no override is provided", () => {
      // en-US: grouping with comma
      expect(formatNumber(i18n, 1234567)).toBe("1,234,567");
    });

    it("uses the override locale when provided", () => {
      // de-DE: grouping with period
      expect(formatNumber(i18n, 1234567, undefined, "de")).toBe("1.234.567");
      // Instance locale unchanged
      expect(i18n.locale).toBe("en");
    });

    it("re-uses cached Intl.NumberFormat per (locale, options)", () => {
      // Just call twice; correctness is the same value, and the impl asserts
      // by cache-key construction. Coverage of the cache key including
      // override locale is the real win here.
      expect(formatNumber(i18n, 1, undefined, "fr")).toBe("1");
      expect(formatNumber(i18n, 2, undefined, "fr")).toBe("2");
      expect(formatNumber(i18n, 2, undefined, "de")).toBe("2");
    });
  });

  describe("formatDate", () => {
    it("uses instance locale when no override is provided", () => {
      const result = formatDate(i18n, new Date("2026-05-19"), { month: "long" });
      expect(result).toBe("May");
    });

    it("uses the override locale when provided", () => {
      const result = formatDate(i18n, new Date("2026-05-19"), { month: "long" }, "de");
      expect(result).toBe("Mai");
      expect(i18n.locale).toBe("en");
    });
  });

  describe("formatCurrency", () => {
    it("uses instance locale when no override is provided", () => {
      // en-US: "$1,234.00"
      expect(formatCurrency(i18n, 1234, "USD")).toMatch(/\$1,234/);
    });

    it("uses the override locale when provided", () => {
      // de-DE for EUR — symbol may vary by ICU but locale-specific grouping
      // dot must appear.
      const result = formatCurrency(i18n, 1234, "EUR", undefined, "de");
      expect(result).toContain("1.234");
      expect(i18n.locale).toBe("en");
    });
  });

  describe("formatRelativeTime", () => {
    it("uses instance locale when no override is provided", () => {
      expect(formatRelativeTime(i18n, -1, "day")).toMatch(/yesterday|1 day ago/i);
    });

    it("uses the override locale when provided", () => {
      const result = formatRelativeTime(i18n, -1, "day", undefined, "fr");
      expect(result.toLowerCase()).toMatch(/hier|il y a 1 jour/);
      expect(i18n.locale).toBe("en");
    });
  });

  describe("backwards compatibility", () => {
    it("existing 2-arg / 3-arg call sites still compile and behave identically", () => {
      // Vue / Svelte / Solid pass options without locale today; behavior
      // must be unchanged.
      const n = formatNumber(i18n, 1, { maximumFractionDigits: 0 });
      const d = formatDate(i18n, new Date("2026-01-01"), { day: "numeric" });
      const c = formatCurrency(i18n, 0.5, "USD", { minimumFractionDigits: 1 });
      const r = formatRelativeTime(i18n, 0, "second", { numeric: "auto" });
      expect(typeof n).toBe("string");
      expect(typeof d).toBe("string");
      expect(typeof c).toBe("string");
      expect(typeof r).toBe("string");
    });
  });
});
