import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";

describe("i18n.locale setter", () => {
  it("should switch locale and use new translations", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { hello: "Hello" },
      fr: { hello: "Bonjour" },
    });
    expect(i18n.t("hello")).toBe("Hello");

    i18n.locale = "fr";

    expect(i18n.t("hello")).toBe("Bonjour");
  });

  it("should emit localeChanged event", () => {
    const i18n = new I18n({ locale: "en" });
    const onLocaleChanged = vi.fn();
    i18n.on("localeChanged", onLocaleChanged);

    i18n.locale = "de";

    expect(onLocaleChanged).toHaveBeenCalledWith({ from: "en", to: "de" });
  });
});

describe("fallbackLocale resolution", () => {
  it("should fallback to a single locale", () => {
    const i18n = new I18n({ locale: "de", fallbackLocale: "en" });
    i18n.addTranslations({
      en: { key: "English" },
      de: { other: "German" },
    });

    expect(i18n.t("key")).toBe("English");
  });

  it.each([
    ["1st", "frOnly", "FR"],
    ["2nd", "esOnly", "ES"],
    ["3rd", "enOnly", "EN"],
  ])("resolves a key held only by the %s locale in the chain", (_position, key, expected) => {
    const i18n = new I18n({ locale: "it", fallbackLocale: ["fr", "es", "en"] });
    i18n.addTranslations({
      en: { enOnly: "EN" },
      es: { esOnly: "ES" },
      fr: { frOnly: "FR" },
    });

    expect(i18n.t(key)).toBe(expected);
  });

  it("returns the key itself when no fallback chain is configured", () => {
    const i18n = new I18n({ locale: "de" });
    i18n.addTranslations({
      en: { greeting: "Hello" },
      fr: { greeting: "Bonjour" },
      de: { other: "Andere" },
    });

    expect(i18n.t("greeting")).toBe("greeting");
  });

  it("should use updated fallback chain after setFallbackLocale() at runtime", () => {
    const i18n = new I18n({ locale: "de" });
    i18n.addTranslations({
      en: { greeting: "Hello" },
      fr: { greeting: "Bonjour" },
      de: { other: "Andere" },
    });

    i18n.setFallbackLocale(["fr", "en"]);
    expect(i18n.t("greeting")).toBe("Bonjour");

    i18n.setFallbackLocale("en");
    expect(i18n.t("greeting")).toBe("Hello");
  });

  it("should fallback for keys that exist on Object.prototype", () => {
    const i18n = new I18n({ locale: "en", fallbackLocale: "fr" });
    i18n.addTranslations({
      en: { hello: "Hi" },
      fr: { toString: "Chaine" },
    });

    expect(i18n.t("toString")).toBe("Chaine");
  });
});

describe("t() locale override", () => {
  it("should allow overriding locale in t() call", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { key: "EN" },
      fr: { key: "FR" },
    });

    expect(i18n.t("key", { locale: "fr" })).toBe("FR");
  });
});
