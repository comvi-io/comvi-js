import { describe, it, expect } from "vitest";
import { I18n, formatNumber, formatDate, formatRelativeTime } from "../../src";

/**
 * The Intl formatter caches (`src/format.ts`) are module-global bounded FIFO
 * Maps with no size probe, so the eviction itself is NOT observable from here:
 * every test below would still pass if `FORMATTER_CACHE_MAX` were raised to 10⁹
 * or the caches were removed entirely. What they do pin is the property that
 * matters to callers — output stays byte-identical to a fresh `Intl.*` formatter
 * once far more than `FORMATTER_CACHE_MAX` distinct keys have passed through.
 *
 * Pinning the bound itself needs a `_formatterCacheSize()` seam in `src/format.ts`,
 * analogous to the existing `_templateCacheSize()`.
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

const OVER_MAX = 1100;

// The caches are module-global, so one instance serves the whole file; it is
// never read anyway, because every call below passes an explicit locale.
const i18n = new I18n({ locale: "en" });

/** Push >1000 distinct (locale, options) keys through the number-format cache. */
function fillNumberCache(): void {
  let filled = 0;
  outer: for (let sweep = 0; sweep < 2; sweep++) {
    for (const loc of LOCALES) {
      for (let digits = 0; digits <= 20; digits++) {
        formatNumber(i18n, 1, { maximumFractionDigits: digits }, loc);
        if (++filled >= OVER_MAX) break outer;
      }
    }
  }
}

describe("Intl formatter caches — output correctness past the FIFO bound", () => {
  describe("formatNumber", () => {
    it("returns correct output for a known (value, locale, options) after >1000 distinct keys are cached", () => {
      fillNumberCache();

      const expected = new Intl.NumberFormat("en", { style: "percent" }).format(0.5);
      expect(formatNumber(i18n, 0.5, { style: "percent" }, "en")).toBe(expected);
    });

    it("produces the same result as a fresh Intl.NumberFormat after the eviction boundary", () => {
      fillNumberCache();

      const value = 9876.54;
      const locale = "de";
      const expected = new Intl.NumberFormat(locale).format(value);
      expect(formatNumber(i18n, value, undefined, locale)).toBe(expected);
    });
  });

  describe("formatDate", () => {
    it("returns correct output for a known (date, locale) after >1000 distinct keys are cached", () => {
      const testDate = new Date(Date.UTC(2025, 5, 1));

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
            formatDate(i18n, testDate, { dateStyle: style, timeZone: "UTC" }, loc);
            if (++filled >= OVER_MAX) break outer;
          }
        }
      }

      const opts: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      };
      const expected = new Intl.DateTimeFormat("fr", opts).format(testDate);
      expect(formatDate(i18n, testDate, opts, "fr")).toBe(expected);
    });
  });

  describe("formatRelativeTime", () => {
    it("returns correct output for a known (value, unit, locale) after >1000 distinct keys are cached", () => {
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
      const pinLocale = "ja";
      const pinValue = 12345.6;

      // Populates the cache entry for "ja".
      const before = formatNumber(i18n, pinValue, undefined, pinLocale);

      fillNumberCache();

      const after = formatNumber(i18n, pinValue, undefined, pinLocale);

      expect(after).toBe(before);
      expect(after).toBe(new Intl.NumberFormat(pinLocale).format(pinValue));
    });
  });
});
