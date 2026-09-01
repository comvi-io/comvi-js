import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

describe("new I18n(options) — translation option validation", () => {
  it("rejects a translation map that is not an object", () => {
    expect(() => createI18n({ locale: "en", translation: 42 as never })).toThrow(
      /Translation is not an object/,
    );
  });

  it.each([
    ["a string", "oops"],
    ["null", null],
    ["an array", ["a"]],
  ])("rejects a locale catalog that is %s", (_shape, catalog) => {
    expect(() => createI18n({ locale: "en", translation: { en: catalog } as never })).toThrow(
      /Translation is not an object/,
    );
  });
});

describe("new I18n(options) — option defaults", () => {
  it("leaves the fallback chain empty when no fallbackLocale is given", () => {
    const i18n = createI18n({ locale: "en" });

    expect(i18n.getFallbackLocales()).toEqual([]);
  });

  it("turns a single fallbackLocale string into a one-entry chain", () => {
    const i18n = createI18n({ locale: "en", fallbackLocale: "de" });

    expect(i18n.getFallbackLocales()).toEqual(["de"]);
  });

  it("keeps a fallbackLocale array as the chain, in the order given", () => {
    const i18n = createI18n({ locale: "en", fallbackLocale: ["de", "fr"] });

    expect(i18n.getFallbackLocales()).toEqual(["de", "fr"]);
  });

  it("keeps a fallbackLocale equal to the current locale in the chain", () => {
    const i18n = createI18n({ locale: "en", fallbackLocale: "en" });

    expect(i18n.getFallbackLocales()).toEqual(["en"]);
  });

  it("defaults devMode to the build's development flag", () => {
    const i18n = createI18n({ locale: "en" });

    expect(i18n.devMode).toBe(true);
  });

  it("passes defaultNs to the translation cache, so a namespace-less cache read resolves it", () => {
    const i18n = createI18n({
      locale: "en",
      defaultNs: "ui",
      translation: { en: { save: "Save" } },
    });

    expect(i18n.translationCache.get("en")).toEqual({ save: "Save" });
  });
});
