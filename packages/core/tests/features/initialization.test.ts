import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";

describe("new I18n(options) — option validation", () => {
  it.each([
    ["omitted", {}],
    ["an empty string", { locale: "" }],
  ])("throws when locale is %s", (_label, options) => {
    expect(() => new I18n(options as any)).toThrowError(
      expect.objectContaining({ message: "@comvi/core: Locale is not set" }),
    );
  });

  it("throws a validation error when translation is null", () => {
    expect(() => new I18n({ locale: "en", translation: null as any })).toThrowError(
      expect.objectContaining({ message: "@comvi/core: Translation is not an object" }),
    );
  });
});

describe("new I18n(options) — initial translations", () => {
  it("should accept initial translations", () => {
    const i18n = new I18n({
      locale: "en",
      translation: {
        en: { key: "Value" },
      },
    });

    expect(i18n.t("key")).toBe("Value");
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

  it("normalizes an already-flat catalog into a prototype-less one, leaving the input untouched", () => {
    const flatTranslations = {
      "nested.deep": "Original",
    };

    const i18n = new I18n({
      locale: "en",
      translation: {
        en: flatTranslations,
      },
    });

    expect(Object.getPrototypeOf(flatTranslations)).toBe(Object.prototype);
    expect(i18n.t("nested.deep")).toBe("Original");
    expect(i18n.hasTranslation("toString")).toBe(false);
    expect(i18n.t("toString")).toBe("toString");
  });

  it("falls back to copying frozen flat initial translations, so a later merge still works (sequence)", () => {
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
    // A COPY, not the frozen object itself — otherwise the merge below throws.
    expect(i18n.getTranslations()).not.toBe(flatTranslations);

    i18n.addTranslations({ en: { extra: "X" } });

    expect(i18n.t("extra")).toBe("X");
  });
});

describe("init()", () => {
  it("calling init() twice re-executes plugins and emits initialized again (sequence)", async () => {
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

    expect(plugin).toHaveBeenCalledTimes(2);
    expect(cleanupOrder).toEqual([]);

    await i18n.destroy();

    // LIFO order.
    expect(cleanupOrder).toEqual(["cleanup-2", "cleanup-1"]);
  });

  it("should use 'default' namespace when none specified", async () => {
    const i18n = new I18n({ locale: "en" });
    await i18n.init();

    i18n.addTranslations({ "en:default": { testKey: "Found It" } });

    expect(i18n.t("testKey")).toBe("Found It");
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

  it("rejects init() when the initial namespace load fails", async () => {
    const i18n = new I18n({ locale: "en", ns: ["common"] });
    i18n.registerLoader(async () => {
      throw new Error("backend exploded");
    });

    await expect(i18n.init()).rejects.toThrow(
      /Failed to load all namespaces|E_ALL_NAMESPACES_FAILED/,
    );

    expect(i18n.isInitialized).toBe(false);
    expect(i18n.isInitializing).toBe(false);
    expect(i18n.isLoading).toBe(false);
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

describe("init() after destroy()", () => {
  it("rejects and does not re-run the plugins", async () => {
    const plugin = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [] });
    i18n.use(plugin);
    await i18n.init();
    await i18n.destroy();

    await expect(i18n.init()).rejects.toThrow(/destroy|E_INSTANCE_DESTROYED/);

    expect(plugin).toHaveBeenCalledTimes(1);
  });
});
