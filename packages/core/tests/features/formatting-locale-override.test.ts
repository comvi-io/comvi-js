/**
 * The optional `locale` argument on the format* helpers: the instance locale is
 * used when it is omitted, and the override wins when passed.
 *
 * Expectations are literals wherever the CLDR output is stable; the `Intl.*`
 * oracle is kept only for the cases parametrized over a locale, where a literal
 * table would restate CLDR rather than the contract.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { I18n, formatNumber, formatDate, formatCurrency, formatRelativeTime } from "../../src";

const DATE = new Date(Date.UTC(2026, 4, 19));
const MONTH: Intl.DateTimeFormatOptions = { month: "long", timeZone: "UTC" };

describe("Formatters — optional `locale` override", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("formatNumber", () => {
    it("uses instance locale when no override is provided", () => {
      // en-US: comma grouping.
      expect(formatNumber(i18n, 1234567)).toBe("1,234,567");
    });

    it("uses the override locale when provided", () => {
      // de-DE: period grouping.
      expect(formatNumber(i18n, 1234567, undefined, "de")).toBe("1.234.567");
      expect(i18n.locale).toBe("en");
    });

    it("uses the instance locale after i18n.locale changes", () => {
      i18n.locale = "de";

      expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
    });

    it.each(["fr", "de", "en"])(
      "keys the formatter on the override locale %s, not the instance locale",
      (locale) => {
        // A grouped value is what makes the locales distinguishable at all.
        const expected = new Intl.NumberFormat(locale).format(1234567.5);

        expect(formatNumber(i18n, 1234567.5, undefined, locale)).toBe(expected);
      },
    );
  });

  describe("formatDate", () => {
    it("uses instance locale when no override is provided", () => {
      expect(formatDate(i18n, DATE, MONTH)).toBe("May");
    });

    it("uses the override locale when provided", () => {
      expect(formatDate(i18n, DATE, MONTH, "de")).toBe("Mai");
      expect(i18n.locale).toBe("en");
    });
  });

  describe("formatCurrency", () => {
    it("uses instance locale when no override is provided", () => {
      expect(formatCurrency(i18n, 1234, "USD")).toBe("$1,234.00");
    });

    it("uses the override locale when provided", () => {
      // de-DE puts the symbol last, after a NO-BREAK SPACE.
      expect(formatCurrency(i18n, 1234, "EUR", undefined, "de")).toBe("1.234,00\u00A0€");
      expect(i18n.locale).toBe("en");
    });
  });

  describe("formatRelativeTime", () => {
    it("uses instance locale when no override is provided", () => {
      expect(formatRelativeTime(i18n, -1, "day")).toBe("1 day ago");
    });

    it("formats a future value in the instance locale", () => {
      expect(formatRelativeTime(i18n, 3, "day")).toBe("in 3 days");
    });

    it("uses the override locale when provided", () => {
      expect(formatRelativeTime(i18n, -1, "day", undefined, "fr")).toBe("il y a 1 jour");
      expect(i18n.locale).toBe("en");
    });
  });

  describe("backwards compatibility", () => {
    it("a 3-arg call (options, no locale) keeps formatting in the instance locale", () => {
      const date = new Date(Date.UTC(2026, 0, 1));

      expect(formatNumber(i18n, 1, { maximumFractionDigits: 0 })).toBe("1");
      expect(formatDate(i18n, date, { day: "numeric", timeZone: "UTC" })).toBe("1");
      expect(formatCurrency(i18n, 0.5, "USD", { minimumFractionDigits: 1 })).toBe("$0.5");
      expect(formatRelativeTime(i18n, 0, "second", { numeric: "auto" })).toBe("now");
    });
  });
});
