/**
 * The format* helpers hand `Intl` the locale chain `[locale, ...fallbackLocales]`,
 * so a locale the runtime has no data for formats in the first fallback that it
 * does have, not in the runtime default. `zz` is a well-formed tag no runtime
 * ships data for.
 */

import { describe, it, expect } from "vitest";
import {
  createI18n,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
} from "../../src";

const DATE = new Date(Date.UTC(2026, 4, 19));
const MONTH: Intl.DateTimeFormatOptions = { month: "long", timeZone: "UTC" };

describe("Formatters — the fallback-locale chain", () => {
  it("formats in the first fallback when the runtime has no data for the locale", () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: "de" });

    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
    expect(formatDate(i18n, DATE, MONTH)).toBe("Mai");
    expect(formatCurrency(i18n, 1234.5, "EUR")).toBe("1.234,50\u00a0€");
    expect(formatRelativeTime(i18n, -1, "day")).toBe("vor 1 Tag");
  });

  it("keeps the order of the chain", () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: ["xx", "fr", "de"] });

    expect(formatDate(i18n, DATE, MONTH)).toBe("mai");
  });

  it("follows setFallbackLocale — the cache is keyed by the chain", () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: "de" });
    expect(formatDate(i18n, DATE, MONTH)).toBe("Mai");

    i18n.setFallbackLocale("fr");

    expect(formatDate(i18n, DATE, MONTH)).toBe("mai");
  });

  it("an explicit `locale` argument stays one locale, without the chain", () => {
    const i18n = createI18n({ locale: "en", fallbackLocale: "de" });

    expect(formatNumber(i18n, 1234.5, undefined, "zz")).toBe(
      new Intl.NumberFormat("zz").format(1234.5),
    );
    expect(formatNumber(i18n, 1234.5, undefined, "fr")).toBe(
      new Intl.NumberFormat("fr").format(1234.5),
    );
  });

  it("skips a fallback `Intl` rejects instead of throwing", () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: ["en_US", "de"] });

    expect(() => new Intl.NumberFormat(["zz", "en_US"])).toThrow(RangeError);
    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
    expect(formatNumber(createI18n({ locale: "de", fallbackLocale: "en_US" }), 1234.5)).toBe(
      "1.234,5",
    );
  });

  it("a supported locale still wins over its fallbacks", () => {
    const i18n = createI18n({ locale: "en", fallbackLocale: "de" });

    expect(formatNumber(i18n, 1234.5)).toBe("1,234.5");
  });

  it("reads `fallbackLocales` off any locale source", () => {
    expect(formatNumber({ locale: "zz", fallbackLocales: ["de"] }, 1234.5)).toBe("1.234,5");
    expect(formatNumber({ locale: "de" }, 1234.5)).toBe("1.234,5");
  });

  it("exposes the chain on the instance read-only, detached from the option array", () => {
    const option = ["de", "fr"];
    const i18n = createI18n({ locale: "en", fallbackLocale: option });
    const chain = i18n.fallbackLocales;

    expect(chain).toEqual(["de", "fr"]);
    expect(() => (chain as string[]).push("uk")).toThrow(TypeError);
    option.push("uk");
    expect(i18n.fallbackLocales).toEqual(["de", "fr"]);
  });

  it("returns the same chain between calls and a new one after setFallbackLocale", () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: "de" });
    const before = i18n.fallbackLocales;

    expect(i18n.fallbackLocales).toBe(before);
    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");

    i18n.setFallbackLocale("en");

    expect(i18n.fallbackLocales).not.toBe(before);
    expect(i18n.fallbackLocales).toEqual(["en"]);
    expect(before).toEqual(["de"]);
    expect(formatNumber(i18n, 1234.5)).toBe("1,234.5");
  });

  it("follows a mutable chain on a plain locale source", () => {
    const fallbackLocales = ["de"];
    const source = { locale: "zz", fallbackLocales };

    expect(formatNumber(source, 1234.5)).toBe("1.234,5");
    fallbackLocales[0] = "en";
    expect(formatNumber(source, 1234.5)).toBe("1,234.5");
  });
  it("re-resolves the same chain after a locale switch", () => {
    const i18n = createI18n({ locale: "en", fallbackLocale: "de" });

    expect(formatNumber(i18n, 1234.5)).toBe("1,234.5");
    i18n.locale = "zz";
    expect(formatNumber(i18n, 1234.5)).toBe("1.234,5");
  });

  it("resolves a frozen chain once per locale, a mutable one on every call", () => {
    const filterReads = (target: string[]) => {
      let reads = 0;
      const fallbackLocales = new Proxy(target, {
        get(chain, property, receiver) {
          if (property === "filter") reads++;
          return Reflect.get(chain, property, receiver);
        },
      });
      const source = { locale: "zz", fallbackLocales };
      expect(formatNumber(source, 1234.5)).toBe("1.234,5");
      expect(formatNumber(source, 1234.5)).toBe("1.234,5");
      return reads;
    };

    expect(filterReads(Object.freeze(["de"]) as string[])).toBe(1);
    expect(filterReads(["de"])).toBe(2);
  });
});
