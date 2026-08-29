import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

function twoLocalesTwoNamespaces() {
  return createI18n({
    locale: "en",
    translation: {
      "en:nav": { home: "Home" },
      "en:footer": { legal: "Legal" },
      "de:nav": { home: "Startseite" },
    },
  });
}

describe("clearTranslations(locale)", () => {
  it("drops only that locale", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearTranslations("en");

    expect(i18n.getLoadedLocales()).toEqual(["de"]);
  });

  it("keeps every namespace active", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearTranslations("en");

    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });
});

describe("clearTranslations(locale, namespace)", () => {
  it("keeps the cleared namespace active, so a later load refills it", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearTranslations("en", "nav");

    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });
});

describe("clearTranslations(undefined, namespace)", () => {
  it("drops that namespace from every locale and keeps the other namespaces", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearTranslations(undefined, "nav");

    expect(i18n.getLoadedLocales()).toEqual(["en"]);
    expect(i18n.hasLocale("en", "nav")).toBe(false);
    expect(i18n.hasLocale("en", "footer")).toBe(true);
  });

  it("deactivates the cleared namespace", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearTranslations(undefined, "nav");

    expect(i18n.getActiveNamespaces()).toEqual(["footer"]);
  });
});

describe("clearTranslations() with no scope", () => {
  it("empties every locale and every active namespace", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearTranslations();

    expect(i18n.getLoadedLocales()).toEqual([]);
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("bumps the cache revision exactly once, whatever the number of locales", () => {
    const i18n = twoLocalesTwoNamespaces();
    const before = i18n.translationCache.getRevision();

    i18n.clearTranslations();

    expect(i18n.translationCache.getRevision()).toBe(before + 1);
  });
});

describe("translationsCleared event", () => {
  it("carries the cleared scope", () => {
    const i18n = twoLocalesTwoNamespaces();
    const received: unknown[] = [];
    i18n.on("translationsCleared", (data) => received.push(data));

    i18n.clearTranslations("en", "nav");

    expect(received).toEqual([{ locale: "en", namespace: "nav" }]);
  });
});
