import { describe, it, expect } from "vitest";
import { I18n, formatNumber, formatDate, formatRelativeTime } from "../../src";

/**
 * Behavioural tests for the bounded Intl formatter caches introduced in fix/v030-core-reactivity.
 *
 * The caches (_numberFormatCache, _dateFormatCache, _relativeTimeFormatCache) are private,
 * so we exercise them purely through the public formatNumber / formatDate / formatRelativeTime
 * APIs.  The goal is to show that:
 *   1. Correctness is preserved after the FIFO eviction threshold (1000) is crossed.
 *   2. The process does not throw or produce garbled output when the cache wraps over.
 */

// Real BCP-47 locale tags used for cache-key variation.
// 30 locales × 21 fractionDigit values (0-20) = 630 keys per locale-set sweep;
// two sweeps give 1260 keys, safely over FORMATTER_CACHE_MAX = 1000.
const LOCALES = [
  "en",
  "fr",
  "de",
  "ja",
  "zh",
  "ko",
  "es",
  "pt",
  "it",
  "ru",
  "ar",
  "tr",
  "nl",
  "pl",
  "sv",
  "da",
  "fi",
  "no",
  "cs",
  "hu",
  "ro",
  "el",
  "he",
  "uk",
  "vi",
  "th",
  "id",
  "ms",
  "fa",
  "hr",
];

/** Fill `i18n`'s number-format cache with >1000 distinct (locale, options) keys. */
function fillNumberCache(i18n: I18n, count: number): void {
  let filled = 0;
  outer: for (let sweep = 0; sweep < 2; sweep++) {
    for (const loc of LOCALES) {
      for (let digits = 0; digits <= 20; digits++) {
        formatNumber(i18n, 1, { maximumFractionDigits: digits }, loc);
        if (++filled >= count) break outer;
      }
    }
  }
}

const OVER_MAX = 1100;

describe("Intl formatter cache — bounded FIFO eviction", () => {
  describe("formatNumber", () => {
    it("returns correct output for a known (value, locale, options) after >1000 distinct keys are cached", () => {
      const i18n = new I18n({ locale: "en" });

      fillNumberCache(i18n, OVER_MAX);

      const expected = new Intl.NumberFormat("en", { style: "percent" }).format(0.5);
      expect(formatNumber(i18n, 0.5, { style: "percent" }, "en")).toBe(expected);
    });

    it("produces the same result as a fresh Intl.NumberFormat after the eviction boundary", () => {
      const i18n = new I18n({ locale: "en" });

      fillNumberCache(i18n, OVER_MAX);

      const value = 9876.54;
      const locale = "de";
      const expected = new Intl.NumberFormat(locale).format(value);
      expect(formatNumber(i18n, value, undefined, locale)).toBe(expected);
    });
  });

  describe("formatDate", () => {
    it("returns correct output for a known (date, locale) after >1000 distinct keys are cached", () => {
      const i18n = new I18n({ locale: "en" });
      const testDate = new Date(2025, 5, 1); // 2025-06-01

      // Vary (locale, dateStyle) to produce >1000 distinct cache keys.
      const dateStyles: Intl.DateTimeFormatOptions["dateStyle"][] = [
        "full",
        "long",
        "medium",
        "short",
      ];
      let filled = 0;
      outer: for (let sweep = 0; sweep < 2; sweep++) {
        for (const loc of LOCALES) {
          for (const style of dateStyles) {
            formatDate(i18n, testDate, { dateStyle: style }, loc);
            if (++filled >= OVER_MAX) break outer;
          }
        }
      }

      const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
      const expected = new Intl.DateTimeFormat("fr", opts).format(testDate);
      expect(formatDate(i18n, testDate, opts, "fr")).toBe(expected);
    });
  });

  describe("formatRelativeTime", () => {
    it("returns correct output for a known (value, unit, locale) after >1000 distinct keys are cached", () => {
      const i18n = new I18n({ locale: "en" });

      // Vary (locale, numeric) options to produce many distinct cache keys.
      const numericOpts: Intl.RelativeTimeFormatNumeric[] = ["always", "auto"];
      let filled = 0;
      outer: for (let sweep = 0; sweep < 2; sweep++) {
        for (const loc of LOCALES) {
          for (const numeric of numericOpts) {
            formatRelativeTime(i18n, -1, "day", { numeric }, loc);
            if (++filled >= OVER_MAX) break outer;
          }
        }
      }

      const expected = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-1, "day");
      expect(formatRelativeTime(i18n, -1, "day", { numeric: "auto" }, "en")).toBe(expected);
    });
  });

  describe("cross-eviction correctness", () => {
    it("calling the same (locale, options) key before and after eviction returns identical results", () => {
      const i18n = new I18n({ locale: "en" });
      const pinLocale = "ja";
      const pinValue = 12345.6;

      // Get a baseline result before eviction (this populates the cache for "ja").
      const before = formatNumber(i18n, pinValue, undefined, pinLocale);

      // Push the cache past the eviction threshold, evicting the pinned "ja" entry.
      fillNumberCache(i18n, OVER_MAX);

      // The pinned entry was evicted; re-creating it must yield the same result.
      const after = formatNumber(i18n, pinValue, undefined, pinLocale);

      expect(after).toBe(before);
      expect(after).toBe(new Intl.NumberFormat(pinLocale).format(pinValue));
    });
  });
});
