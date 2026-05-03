import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";

describe("Initialization & Configuration", () => {
  it("throws when locale is not provided", () => {
    expect(() => new I18n({} as any)).toThrow(/Locale is not set|E_LOCALE_NOT_SET/);
    expect(() => new I18n({ locale: "" } as any)).toThrow(/Locale is not set|E_LOCALE_NOT_SET/);
  });

  it("throws a validation error when translation is null", () => {
    expect(() => new I18n({ locale: "en", translation: null as any })).toThrow(
      /Translation is not an object|E_TRANSLATION_NOT_OBJECT/,
    );
  });

  it("calling init() twice re-executes plugins and emits initialized again", async () => {
    const pluginSpy = vi.fn();
    const initCallback = vi.fn();

    const i18n = new I18n({ locale: "en" });
    i18n.use(pluginSpy);
    i18n.on("initialized", initCallback);

    await i18n.init();
    expect(pluginSpy).toHaveBeenCalledTimes(1);
    expect(initCallback).toHaveBeenCalledTimes(1);
    expect(i18n.isInitialized).toBe(true);

    await i18n.init();
    expect(pluginSpy).toHaveBeenCalledTimes(2);
    expect(initCallback).toHaveBeenCalledTimes(2);
    expect(i18n.isInitialized).toBe(true);
  });

  it("calling init() twice with cleanup-returning plugin accumulates cleanups and calls all on destroy in LIFO order", async () => {
    const cleanupOrder: string[] = [];
    let callCount = 0;
    const plugin = vi.fn(() => {
      const id = `cleanup-${++callCount}`;
      return () => {
        cleanupOrder.push(id);
      };
    });

    const i18n = new I18n({ locale: "en" });
    i18n.use(plugin);

    await i18n.init();
    await i18n.init();

    // Plugin executed twice, so cleanup was registered twice
    expect(plugin).toHaveBeenCalledTimes(2);
    expect(cleanupOrder).toEqual([]);

    await i18n.destroy();

    // Both accumulated cleanup entries are called on destroy in LIFO order
    expect(cleanupOrder).toEqual(["cleanup-2", "cleanup-1"]);
  });

  it("rejects init() after destroy() and requires a new instance", async () => {
    const plugin = vi.fn((i18n: I18n) => {
      i18n.registerLoader(async (lang, ns) => ({ key: `${lang}:${ns}` }));
    });

    const i18n = new I18n({ locale: "en", ns: [] });
    i18n.use(plugin);

    await i18n.init();
    await i18n.addActiveNamespace("common");
    expect(i18n.t("key", { ns: "common" })).toBe("en:common");

    await i18n.destroy();

    expect(i18n.isInitialized).toBe(false);
    expect(i18n.getLoader()).toBeUndefined();
    await expect(i18n.init()).rejects.toThrow(/destroy|E_INSTANCE_DESTROYED/);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it("should use 'default' namespace when none specified", async () => {
    const i18n = new I18n({ locale: "en" });
    await i18n.init();

    // Translations added to "default" namespace should be accessible without explicit ns
    i18n.addTranslations({ "en:default": { testKey: "Found It" } });
    expect(i18n.t("testKey")).toBe("Found It");
  });

  it("should accept initial translations", () => {
    const i18n = new I18n({
      locale: "en",
      translation: {
        en: { key: "Value" },
      },
    });
    expect(i18n.t("key")).toBe("Value");
  });

  it("should accept already-flat initial translations", () => {
    const i18n = new I18n({
      locale: "en",
      translation: {
        en: {
          "nested.deep": "Value",
        },
      },
    });

    expect(i18n.t("nested.deep")).toBe("Value");
  });

  it("should flatten nested keys in initial translations", () => {
    const i18n = new I18n({
      locale: "en",
      translation: {
        en: {
          nested: {
            deep: "Value",
          },
        },
      },
    });
    expect(i18n.t("nested.deep")).toBe("Value");
  });

  it("sanitizes already-flat initial translations in place", () => {
    const flatTranslations = {
      "nested.deep": "Original",
    };

    const i18n = new I18n({
      locale: "en",
      translation: {
        en: flatTranslations,
      },
    });

    expect(Object.getPrototypeOf(flatTranslations)).toBe(null);
    expect(i18n.t("nested.deep")).toBe("Original");
    expect(i18n.hasTranslation("toString")).toBe(false);
    expect(i18n.t("toString")).toBe("toString");
  });

  it("falls back to copying frozen flat initial translations", () => {
    const flatTranslations = Object.freeze({
      "nested.deep": "Frozen",
    });

    const i18n = new I18n({
      locale: "en",
      translation: {
        en: flatTranslations,
      },
    });

    expect(Object.getPrototypeOf(flatTranslations)).toBe(Object.prototype);
    expect(i18n.t("nested.deep")).toBe("Frozen");
  });

  it("should load initial namespaces during init()", async () => {
    const loaderCalls: string[] = [];
    const i18n = new I18n({
      locale: "en",
      ns: ["common", "dashboard"],
    });

    i18n.registerLoader(async (lang, ns) => {
      loaderCalls.push(`${lang}:${ns}`);
      if (ns === "common") return { hello: "Hello" };
      if (ns === "dashboard") return { title: "Dashboard" };
      return {};
    });

    await i18n.init();

    expect(loaderCalls).toHaveLength(2);
    expect(new Set(loaderCalls)).toEqual(new Set(["en:common", "en:dashboard"]));
    expect(i18n.t("hello", { ns: "common" })).toBe("Hello");
    expect(i18n.t("title", { ns: "dashboard" })).toBe("Dashboard");
  });

  it("should load already-flat namespace payloads during init()", async () => {
    const i18n = new I18n({
      locale: "en",
      ns: ["common"],
    });

    i18n.registerLoader(async () => ({
      "nav.header.title": "Welcome",
    }));

    await i18n.init();

    expect(i18n.t("nav.header.title", { ns: "common" })).toBe("Welcome");
  });

  it("should allow skipping initial namespace loading with ns: []", async () => {
    const loaderCalls: string[] = [];
    const i18n = new I18n({
      locale: "en",
      ns: [],
    });

    i18n.registerLoader(async (lang, ns) => {
      loaderCalls.push(`${lang}:${ns}`);
      return { key: "Value" };
    });

    await i18n.init();

    expect(loaderCalls).toEqual([]);
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("uses updated default namespace if changed before init()", async () => {
    const loaderCalls: string[] = [];
    const i18n = new I18n({ locale: "en" });

    i18n.registerLoader(async (lang, ns) => {
      loaderCalls.push(`${lang}:${ns}`);
      return { key: "Value" };
    });

    i18n.setDefaultNamespace("common");
    await i18n.init();

    expect(loaderCalls).toEqual(["en:common"]);
    expect(i18n.t("key")).toBe("Value");
  });
});
