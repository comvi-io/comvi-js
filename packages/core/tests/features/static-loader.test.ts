import { describe, it, expect } from "vitest";
import { I18n } from "../../src";

describe("registerLoader with import map", () => {
  it("loads translations from import map", async () => {
    const i18n = new I18n({
      locale: "en",
      defaultNs: "common",
      ns: ["common"],
    });

    i18n.registerLoader({
      "en:common": () => Promise.resolve({ hello: "Hello" }),
    });

    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
  });

  it("unwraps { default: ... } from dynamic imports", async () => {
    const i18n = new I18n({
      locale: "en",
      defaultNs: "common",
      ns: ["common"],
    });

    i18n.registerLoader({
      "en:common": () => Promise.resolve({ default: { welcome: "Welcome" } }),
    });

    await i18n.init();

    expect(i18n.t("welcome")).toBe("Welcome");
  });

  it("normalizes keys without colon using real defaultNs", async () => {
    const i18n = new I18n({
      locale: "en",
      defaultNs: "common",
      ns: ["common"],
    });

    i18n.registerLoader({
      en: () => Promise.resolve({ hello: "Hello" }),
    });

    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
  });

  it("normalizes with custom defaultNs", async () => {
    const i18n = new I18n({
      locale: "en",
      defaultNs: "main",
      ns: ["main"],
    });

    i18n.registerLoader({
      en: () => Promise.resolve({ greeting: "Hi" }),
    });

    await i18n.init();

    expect(i18n.t("greeting")).toBe("Hi");
  });

  it("uses the current defaultNs when resolving locale-only import map entries", async () => {
    const i18n = new I18n({
      locale: "en",
      defaultNs: "common",
      ns: [],
    });

    i18n.registerLoader({
      en: () => Promise.resolve({ greeting: "Hi" }),
    });

    i18n.setDefaultNamespace("main");
    await i18n.addActiveNamespace("main");

    expect(i18n.t("greeting")).toBe("Hi");
  });

  it("throws for missing entries", async () => {
    const i18n = new I18n({
      locale: "en",
      defaultNs: "common",
      ns: ["common"],
    });

    i18n.registerLoader({
      "fr:common": () => Promise.resolve({ hello: "Bonjour" }),
    });

    await expect(i18n.init()).rejects.toThrow(
      /Failed to load all namespaces|E_ALL_NAMESPACES_FAILED/,
    );
  });
});
