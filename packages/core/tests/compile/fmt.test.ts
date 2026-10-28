/**
 * The shared formatter and Intl cache (R4-7).
 * Ported by meaning from: formatter-cache-bounds, formatter-cache-key-options,
 * plural-rules-cache, icu-hash-lazy-format; numbering-system probe from lot-0 S3 extra.mjs.
 */
import { describe, expect, it, vi } from "vitest";
import {
  _intlCacheSize,
  formatNumber,
  formatValue,
  INTL_CACHE_LIMIT,
  intl,
  pluralRules,
} from "../../src/compile/fmt";

const NON_LATN = ["ar-EG", "fa", "bn", "th-u-nu-thai", "hi-u-nu-deva", "mr", "my", "ne"];

describe("formatNumber", () => {
  it.each(NON_LATN)("prints the digits of %s, even below 1000 (output probe, R4-7)", (locale) => {
    for (const n of [0, 5, 109, 999, 1000, 1234.5]) {
      expect(formatNumber(n, locale)).toBe(new Intl.NumberFormat(locale).format(n));
    }
  });

  it.each(["en", "de", "uk", "ja", "sv"])(
    "matches Intl for %s across the fast-path boundary",
    (locale) => {
      for (const n of [0, -0, 1, 999, 1000, -1, -5, 0.5, 1e21, Infinity, -Infinity, NaN]) {
        expect(formatNumber(n, locale)).toBe(new Intl.NumberFormat(locale).format(n));
      }
    },
  );

  it("probes a locale once and skips Intl for small integers afterwards", () => {
    formatNumber(1, "en");
    const spy = vi.spyOn(Intl, "NumberFormat");
    for (let n = 0; n < 100; n++) formatNumber(n, "en");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("the Intl cache", () => {
  it("serves a repeated key from the cache", () => {
    const a = intl("NumberFormat", "de", "");
    expect(intl("NumberFormat", "de", "")).toBe(a);
    expect(_intlCacheSize()).toBe(1);
  });

  it("keys ordinal and cardinal rules separately", () => {
    expect(pluralRules("en", true)).not.toBe(pluralRules("en", false));
    expect(pluralRules("en", true).select(2)).toBe("two");
    expect(pluralRules("en", false)).toBe(pluralRules("en", false));
  });

  it(`is bounded: never more than ${INTL_CACHE_LIMIT} formatters`, () => {
    for (let i = 0; i < INTL_CACHE_LIMIT * 2 + 3; i++) intl("PluralRules", "en", "v" + i);
    expect(_intlCacheSize()).toBeLessThanOrEqual(INTL_CACHE_LIMIT);
    expect(formatNumber(1234, "de")).toBe("1.234");
  });
});

describe("formatValue (a plain {x}, R3-17)", () => {
  it("is String(value) for numbers, Dates and string lists, and never builds a formatter", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 23));
    expect(formatValue(1004)).toBe("1004");
    expect(formatValue(2026)).toBe("2026");
    expect(formatValue(d)).toBe(String(d));
    expect(formatValue(["a", "b"])).toBe("a,b");
    expect(_intlCacheSize()).toBe(0);
  });

  it("passes objects, functions and lists holding one through untouched", () => {
    const node = {};
    const fn = () => 1;
    const list = ["a", node];
    expect(formatValue(node)).toBe(node);
    expect(formatValue(fn)).toBe(fn);
    expect(formatValue(list)).toBe(list);
  });
});

/** Counts reads of Intl.NumberFormat#format, an accessor that returns the bound formatter. */
const formatGetter = () =>
  vi.spyOn(Intl.NumberFormat.prototype as { readonly format: unknown }, "format", "get");

describe("formatNumber's fast path (counted work)", () => {
  it("formats no integer from 0 to 999 through Intl once the locale is probed", () => {
    formatNumber(5, "de");
    const format = formatGetter();
    const out: string[] = [];
    for (let n = 0; n < 1000; n++) out.push(formatNumber(n, "de"));
    expect(format).not.toHaveBeenCalled();
    expect(out[0]).toBe("0");
    expect(out[999]).toBe("999");
  });

  it("takes Intl for 1000, fractions, negatives and -0", () => {
    formatNumber(5, "en");
    const format = formatGetter();
    for (const n of [1000, 0.5, -1, -0]) formatNumber(n, "en");
    expect(format).toHaveBeenCalledTimes(4);
  });
});

describe("the Intl cache keys", () => {
  it("keeps exactly INTL_CACHE_LIMIT formatters before it starts over", () => {
    const first = intl("PluralRules", "en", "v0");
    for (let i = 1; i < INTL_CACHE_LIMIT; i++) intl("PluralRules", "en", "v" + i);
    expect(_intlCacheSize()).toBe(INTL_CACHE_LIMIT);
    expect(intl("PluralRules", "en", "v0")).toBe(first);
    intl("PluralRules", "en", "one-more");
    expect(_intlCacheSize()).toBe(1);
  });

  it("never confuses a locale and a variant that concatenate alike", () => {
    // "en" + "o" (ordinal) and "eno" + "" (cardinal) must be two keys.
    const ordinal = pluralRules("en", true);
    expect(pluralRules("eno", false)).not.toBe(ordinal);
    expect(_intlCacheSize()).toBe(2);
  });
});
