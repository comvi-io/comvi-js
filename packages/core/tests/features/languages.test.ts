import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../../src";

describe("Language Management", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("Switching Locales", () => {
    it("should switch locale and use new translations", () => {
      i18n.addTranslations({
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      });

      expect(i18n.t("hello")).toBe("Hello");

      i18n.locale = "fr";
      expect(i18n.t("hello")).toBe("Bonjour");
    });

    it("should emit localeChanged event", () => {
      let lastPayload: any = null;
      i18n.on("localeChanged", (payload) => {
        lastPayload = payload;
      });

      i18n.locale = "de";
      expect(lastPayload).toEqual({ from: "en", to: "de" });
    });
  });

  describe("Fallback Languages", () => {
    it("should fallback to a single locale", () => {
      i18n = new I18n({ locale: "de", fallbackLocale: "en" });
      i18n.addTranslations({
        en: { key: "English" },
        de: { other: "German" },
      });

      // 'key' missing in 'de', found in 'en'
      expect(i18n.t("key")).toBe("English");
    });

    it("should fallback through an array of locales", () => {
      i18n = new I18n({
        locale: "it",
        fallbackLocale: ["fr", "es", "en"],
      });

      i18n.addTranslations({
        en: { enOnly: "EN" },
        es: { esOnly: "ES" },
        fr: { frOnly: "FR" },
      });

      expect(i18n.t("frOnly")).toBe("FR"); // 1st fallback
      expect(i18n.t("esOnly")).toBe("ES"); // 2nd fallback
      expect(i18n.t("enOnly")).toBe("EN"); // 3rd fallback
    });

    it("should use updated fallback chain after setFallbackLocale() at runtime", () => {
      i18n = new I18n({ locale: "de" });
      i18n.addTranslations({
        en: { greeting: "Hello" },
        fr: { greeting: "Bonjour" },
        de: { other: "Andere" },
      });

      // No fallback configured yet, so missing key returns the key itself
      expect(i18n.t("greeting")).toBe("greeting");

      // Set fallback to French at runtime
      i18n.setFallbackLocale(["fr", "en"]);
      expect(i18n.t("greeting")).toBe("Bonjour");

      // Change fallback to English only
      i18n.setFallbackLocale("en");
      expect(i18n.t("greeting")).toBe("Hello");
    });

    it("should fallback for keys that exist on Object.prototype", () => {
      i18n = new I18n({ locale: "en", fallbackLocale: "fr" });
      i18n.addTranslations({
        en: { hello: "Hi" },
        fr: { toString: "Chaine" },
      });

      expect(i18n.t("toString")).toBe("Chaine");
    });
  });

  describe("Language Override", () => {
    it("should allow overriding locale in t() call", () => {
      i18n.addTranslations({
        en: { key: "EN" },
        fr: { key: "FR" },
      });

      expect(i18n.t("key", { locale: "fr" })).toBe("FR");
    });
  });
});
