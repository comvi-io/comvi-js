import { describe, it, expect, beforeEach } from "vitest";
import type { LocaleSource } from "../../src";
import {
  formatNumber,
  formatDate,
  formatRelativeTime,
  getTextDirection,
  _formatterCacheSize,
  _resetFormatterCaches,
} from "../../src/format";

/**
 * `FORMATTER_CACHE_MAX` (src/format.ts) is 1000 and is not exported, so every
 * expected size below is written as the literal entry count it produces.
 * `_formatterCacheSize()` sums the three Intl caches and the text-direction one.
 */

// The helpers take a `LocaleSource`, so a plain object is the whole contract —
// no I18n instance, and nothing that could populate a cache behind the test.
const source: LocaleSource = { locale: "en" };

const DATE = new Date(Date.UTC(2026, 4, 19));
const MONTH: Intl.DateTimeFormatOptions = { month: "long", timeZone: "UTC" };
const UTC: Intl.DateTimeFormatOptions = { timeZone: "UTC" };

/**
 * `-x-…` is a private-use subtag: every tag below is a distinct cache key that
 * still resolves to English data, so a sweep costs one formatter per key and
 * nothing else.
 */
const tag = (n: number): string => `en-x-k${n}`;

function fillNumberCache(count: number): void {
  for (let n = 0; n < count; n++) formatNumber(source, 1, undefined, tag(n));
}

function fillDateCache(count: number): void {
  for (let n = 0; n < count; n++) formatDate(source, DATE, UTC, tag(n));
}

function fillRelativeTimeCache(count: number): void {
  for (let n = 0; n < count; n++) formatRelativeTime(source, -1, "day", undefined, tag(n));
}

beforeEach(_resetFormatterCaches);

describe("Intl formatter caches — the bounded FIFO", () => {
  it("adds one entry per distinct (locale, options) key", () => {
    formatNumber(source, 1, undefined, "en");
    formatNumber(source, 1, undefined, "de");
    formatNumber(source, 1, { style: "percent" }, "en");

    expect(_formatterCacheSize()).toBe(3);
  });

  it("serves a repeated key from the cache instead of adding an entry", () => {
    const first = formatNumber(source, 1234.5, undefined, "de");
    const second = formatNumber(source, 1234.5, undefined, "de");

    expect(second).toBe(first);
    expect(_formatterCacheSize()).toBe(1);
  });

  it("counts the number, date, relative-time and text-direction caches together", () => {
    formatNumber(source, 1, undefined, "en");
    formatDate(source, DATE, UTC, "en");
    formatRelativeTime(source, -1, "day", undefined, "en");
    getTextDirection("ar");

    expect(_formatterCacheSize()).toBe(4);
  });

  it("holds every key while they fit: 1000 distinct number keys → 1000 entries", () => {
    fillNumberCache(1000);

    expect(_formatterCacheSize()).toBe(1000);
  });

  it("stops growing at the bound: 1001 distinct number keys → 1000 entries", () => {
    fillNumberCache(1001);

    expect(_formatterCacheSize()).toBe(1000);
  });

  it("bounds each cache separately: a full number cache plus one date and one relative-time key → 1002 entries", () => {
    fillNumberCache(1001);

    formatDate(source, DATE, UTC, "en");
    formatRelativeTime(source, -1, "day", undefined, "en");

    expect(_formatterCacheSize()).toBe(1002);
  });

  describe("output across the eviction boundary", () => {
    it("formatNumber returns the identical string for a key the sweep evicted", () => {
      const before = formatNumber(source, 12345.6, undefined, "ja");

      fillNumberCache(1001);

      expect(_formatterCacheSize()).toBe(1000);
      expect(formatNumber(source, 12345.6, undefined, "ja")).toBe("12,345.6");
      expect(before).toBe("12,345.6");
    });

    it("formatDate returns the identical string for a key the sweep evicted", () => {
      const before = formatDate(source, DATE, MONTH, "de");

      fillDateCache(1001);

      expect(_formatterCacheSize()).toBe(1000);
      expect(formatDate(source, DATE, MONTH, "de")).toBe("Mai");
      expect(before).toBe("Mai");
    });

    it("formatRelativeTime returns the identical string for a key the sweep evicted", () => {
      const before = formatRelativeTime(source, -1, "day", { numeric: "auto" }, "en");

      fillRelativeTimeCache(1001);

      expect(_formatterCacheSize()).toBe(1000);
      expect(formatRelativeTime(source, -1, "day", { numeric: "auto" }, "en")).toBe("yesterday");
      expect(before).toBe("yesterday");
    });
  });
});
