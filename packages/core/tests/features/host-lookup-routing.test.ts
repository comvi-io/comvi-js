import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

// `hasTranslation(key, locale?, namespace?, checkFallbacks?)` takes no options
// object, so reaching the fourth argument means naming the two it skips.
const CURRENT_LOCALE = undefined;
const DEFAULT_NAMESPACE = undefined;

const twoLocales = () =>
  createI18n({
    locale: "en",
    translation: { en: { greeting: "Hello" }, de: { farewell: "Tschüss" } },
  });

const twoLocalesWithFallback = () =>
  createI18n({
    locale: "en",
    fallbackLocale: "de",
    translation: { en: { greeting: "Hello" }, de: { farewell: "Tschüss" } },
  });

describe("hasTranslation() routing", () => {
  it("reads the current locale when no locale is given", () => {
    const i18n = twoLocales();

    expect(i18n.hasTranslation("greeting")).toBe(true);
    expect(i18n.hasTranslation("farewell")).toBe(false);
  });

  it("reads the named locale's catalog, not the current one", () => {
    const i18n = twoLocales();

    expect(i18n.hasTranslation("farewell", "de")).toBe(true);
    expect(i18n.hasTranslation("greeting", "de")).toBe(false);
  });

  it("defaults checkFallbacks to false when the argument is omitted", () => {
    const i18n = twoLocalesWithFallback();

    expect(i18n.hasTranslation("farewell")).toBe(false);
    expect(i18n.hasTranslation("farewell", CURRENT_LOCALE, DEFAULT_NAMESPACE, true)).toBe(true);
  });

  it("returns false with checkFallbacks when no locale in the chain has the key", () => {
    const i18n = twoLocalesWithFallback();

    expect(i18n.hasTranslation("absent", CURRENT_LOCALE, DEFAULT_NAMESPACE, true)).toBe(false);
    expect(i18n.hasTranslation("greeting", CURRENT_LOCALE, DEFAULT_NAMESPACE, true)).toBe(true);
  });
});

describe("t() fallback-chain traversal", () => {
  it("returns the key when a fallback locale has no catalog at all", () => {
    const i18n = createI18n({
      locale: "en",
      fallbackLocale: "de",
      translation: { en: { greeting: "Hello" } },
    });

    expect(i18n.t("farewell")).toBe("farewell");
  });

  // The literal value matters: probing the template cache with a missing key's
  // `undefined` would hit the entry cached for the template "undefined", so the
  // first assertion is what puts that entry in the cache.
  it('does not resolve a missing key to a catalog entry whose value is the string "undefined"', () => {
    const i18n = createI18n({ locale: "en", translation: { en: { ghost: "undefined" } } });

    expect(i18n.t("ghost")).toBe("undefined");
    expect(i18n.t("absent")).toBe("absent");
  });
});

describe("primary-catalog memoization", () => {
  it("re-reads the catalog after setDefaultNamespace(), though no catalog changed", () => {
    const i18n = createI18n({
      locale: "en",
      defaultNs: "nav",
      translation: { "en:nav": { title: "Navigation" }, "en:footer": { title: "Footer" } },
    });
    // Primes the primary-catalog memo, which the namespace switch must invalidate.
    i18n.t("title");

    i18n.setDefaultNamespace("footer");

    expect(i18n.t("title")).toBe("Footer");
  });

  it("resolves a catalog stored under an empty locale and an empty namespace", () => {
    const i18n = createI18n({ locale: "en", defaultNs: "" });
    i18n.addTranslations({ "": { greeting: "Hello" } });

    i18n.locale = "";

    expect(i18n.t("greeting")).toBe("Hello");
  });
});
