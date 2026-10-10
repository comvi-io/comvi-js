import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

function twoLocalesTwoNamespaces() {
  return createI18n({
    locale: "en",
    messages: {
      "en:nav": { home: "Home" },
      "en:footer": { legal: "Legal" },
      "de:nav": { home: "Startseite" },
    },
  });
}

describe("clearMessages(locale)", () => {
  it("drops only that locale", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages("en");

    expect(i18n.getLoadedLocales()).toEqual(["de"]);
  });

  it("keeps every namespace active", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages("en");

    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });
});

describe("clearMessages(locale, namespace)", () => {
  it("keeps the cleared namespace active, so a later load refills it", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages("en", "nav");

    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });
});

describe("clearMessages(undefined, namespace)", () => {
  it("drops that namespace from every locale and keeps the other namespaces", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages(undefined, "nav");

    expect(i18n.getLoadedLocales()).toEqual(["en"]);
    expect(i18n.hasLocale("en", "nav")).toBe(false);
    expect(i18n.hasLocale("en", "footer")).toBe(true);
  });

  it("keeps the cleared namespace active — deactivation is removeActiveNamespace()", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages(undefined, "nav");

    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });
});

describe("clearMessages() with no scope", () => {
  it("empties every locale", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages();

    expect(i18n.getLoadedLocales()).toEqual([]);
  });

  it("keeps every namespace active, so a reload knows what to refetch", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages();

    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });

  it("bumps the cache revision exactly once, whatever the number of locales", () => {
    const i18n = twoLocalesTwoNamespaces();
    const before = i18n.messagesCache.getRevision();

    i18n.clearMessages();

    expect(i18n.messagesCache.getRevision()).toBe(before + 1);
  });
});

describe("clearMessages() over a scope that holds nothing", () => {
  it("leaves every catalog and every active namespace in place for an unknown locale", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages("xx");

    expect(i18n.getLoadedLocales()).toEqual(["en", "de"]);
    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });

  it("still bumps the cache revision for an unknown locale, so memoized reads re-read", () => {
    const i18n = twoLocalesTwoNamespaces();
    const before = i18n.messagesCache.getRevision();

    i18n.clearMessages("xx");

    expect(i18n.messagesCache.getRevision()).toBe(before + 1);
  });

  it("leaves every catalog and every active namespace in place for an unknown namespace", () => {
    const i18n = twoLocalesTwoNamespaces();

    i18n.clearMessages(undefined, "unknown");

    expect(i18n.getLoadedLocales()).toEqual(["en", "de"]);
    expect(i18n.getActiveNamespaces()).toEqual(["nav", "footer"]);
  });
});

describe("messagesCleared event", () => {
  it("carries the cleared scope", () => {
    const i18n = twoLocalesTwoNamespaces();
    const received: unknown[] = [];
    i18n.on("messagesCleared", (data) => received.push(data));

    i18n.clearMessages("en", "nav");

    expect(received).toEqual([{ locale: "en", namespace: "nav" }]);
  });
});
