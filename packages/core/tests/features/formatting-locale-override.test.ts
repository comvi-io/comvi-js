/**
 * The optional `locale` argument on the format* helpers: the instance locale is
 * used when it is omitted, and the override wins when passed.
 *
 * Every expectation is the `Intl.*` oracle for the same inputs, so the suite is
 * immune to ICU/CLDR version drift while still pinning the exact string.
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
      // en-US: comma grouping. A literal, not the Intl oracle — this one is not
      // CLDR-volatile, so a reader can see the contracted string.
      expect(formatNumber(i18n, 1234567)).toBe("1,234,567");
    });

    it("uses the override locale when provided", () => {
      // de-DE: period grouping.
      expect(formatNumber(i18n, 1234567, undefined, "de")).toBe("1.234.567");
      expect(i18n.locale).toBe("en");
    });

    it.each(["fr", "de", "en"])(
      "keys the formatter on the override locale %s, not the instance locale",
      (locale) => {
        // A grouped value is what makes the locales distinguishable at all.
        const expected = new Intl.NumberFormat(locale).format(1234567.5);

        expect(formatNumber(i18n, 1234567.5, undefined, locale)).toBe(expected);
        // A second call must come back from the cache with the SAME locale.
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
      expect(formatCurrency(i18n, 1234, "USD")).toBe(
        new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(1234),
      );
    });

    it("uses the override locale when provided", () => {
      expect(formatCurrency(i18n, 1234, "EUR", undefined, "de")).toBe(
        new Intl.NumberFormat("de", { style: "currency", currency: "EUR" }).format(1234),
      );
      expect(i18n.locale).toBe("en");
    });
  });

  describe("formatRelativeTime", () => {
    it("uses instance locale when no override is provided", () => {
      expect(formatRelativeTime(i18n, -1, "day")).toBe(
        new Intl.RelativeTimeFormat("en").format(-1, "day"),
      );
    });

    it("uses the override locale when provided", () => {
      expect(formatRelativeTime(i18n, -1, "day", undefined, "fr")).toBe(
        new Intl.RelativeTimeFormat("fr").format(-1, "day"),
      );
      expect(i18n.locale).toBe("en");
    });
  });

  describe("backwards compatibility", () => {
    it("a 3-arg call (options, no locale) keeps formatting in the instance locale", () => {
      const numberOpts: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
      const dateOpts: Intl.DateTimeFormatOptions = { day: "numeric", timeZone: "UTC" };
      const currencyOpts: Intl.NumberFormatOptions = { minimumFractionDigits: 1 };
      const relativeOpts: Intl.RelativeTimeFormatOptions = { numeric: "auto" };
      const date = new Date(Date.UTC(2026, 0, 1));

      expect(formatNumber(i18n, 1, numberOpts)).toBe(
        new Intl.NumberFormat("en", numberOpts).format(1),
      );
      expect(formatDate(i18n, date, dateOpts)).toBe(
        new Intl.DateTimeFormat("en", dateOpts).format(date),
      );
      expect(formatCurrency(i18n, 0.5, "USD", currencyOpts)).toBe(
        new Intl.NumberFormat("en", {
          ...currencyOpts,
          style: "currency",
          currency: "USD",
        }).format(0.5),
      );
      expect(formatRelativeTime(i18n, 0, "second", relativeOpts)).toBe(
        new Intl.RelativeTimeFormat("en", relativeOpts).format(0, "second"),
      );
    });
  });
});
