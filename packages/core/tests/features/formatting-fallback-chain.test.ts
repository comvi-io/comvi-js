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

  it("exposes the chain on the instance as a copy", () => {
    const i18n = createI18n({ locale: "en", fallbackLocale: ["de", "fr"] });
    const chain = i18n.fallbackLocales;

    expect(chain).toEqual(["de", "fr"]);
    (chain as string[]).push("uk");
    expect(i18n.fallbackLocales).toEqual(["de", "fr"]);
  });
});
