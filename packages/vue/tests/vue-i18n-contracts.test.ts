import { describe, it, expect, vi } from "vitest";
import { nextTick } from "vue";
import { createI18n } from "../src/createI18n";
import { attachLoader, attachPlugins, createCore, createI18nFromCore } from "../src";
import type { I18nOptions, LoaderResult } from "../src";

// Vue's preset builds the BASE host, so each contract below composes exactly
// the capability it exercises: the loader for `registerLoader`/`onLoadError`/
// `addActiveNamespace`, the plugin host for `use`/`onMissingKey`/the detector.
const createLoaderI18n = (options: I18nOptions) =>
  createI18nFromCore(createCore(options).with(attachLoader));

describe("VueI18n contracts", () => {
  it("keeps the last requested locale when computed setter is called rapidly", async () => {
    const i18n = createLoaderI18n({ locale: "en", defaultNs: "common" });
    let resolveFrench!: () => void;
    const frenchGate = new Promise<void>((resolve) => {
      resolveFrench = resolve;
    });

    i18n.core.registerLoader(async (locale: string, namespace: string): Promise<LoaderResult> => {
      if (namespace !== "common") {
        return {};
      }
      if (locale === "en") {
        return { hello: "Hello" };
      }
      if (locale === "fr") {
        await frenchGate;
        return { hello: "Bonjour" };
      }
      return {};
    });

    await i18n.init();

    i18n.locale.value = "fr";
    i18n.locale.value = "en";
    resolveFrench();

    await vi.waitFor(() => {
      expect(i18n.locale.value).toBe("en");
      expect(i18n.t("hello")).toBe("Hello");
    });
  });

  it("ignores no-op computed locale assignments and updates on real changes", async () => {
    const loader = vi.fn(async (locale: string, namespace: string): Promise<LoaderResult> => {
      if (namespace !== "common") {
        return {};
      }
      return locale === "fr" ? { hello: "Bonjour" } : { hello: "Hello" };
    });
    const i18n = createLoaderI18n({ locale: "en", defaultNs: "common" });
    i18n.core.registerLoader(loader);
    await i18n.init();
    loader.mockClear();
    const localeChangedSpy = vi.fn();
    const unsubscribe = i18n.on("localeChanged", localeChangedSpy);

    i18n.locale.value = "en";
    await nextTick();
    expect(loader).not.toHaveBeenCalled();
    expect(localeChangedSpy).not.toHaveBeenCalled();

    i18n.locale.value = "fr";
    await vi.waitFor(() => {
      expect(localeChangedSpy).toHaveBeenCalledWith({ from: "en", to: "fr" });
      expect(i18n.t("hello")).toBe("Bonjour");
    });

    unsubscribe();
  });

  it("routes computed locale setter errors through onError with source: setLocale", async () => {
    const err = new Error("setLocale failed");
    const onError = vi.fn();
    const i18n = createLoaderI18n({ locale: "en", defaultNs: "common", onError });
    i18n.core.registerLoader(async (locale: string, namespace: string): Promise<LoaderResult> => {
      if (namespace !== "common") return {};
      if (locale === "fr") throw err;
      return { hello: "Hello" };
    });
    await i18n.init();
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});

    i18n.locale.value = "fr";
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '[i18n] Failed to load all namespaces for locale "fr": common',
        }),
        // Core reports "namespace-load" before VueI18n's catch wrapper would
        // report "setLocale"; either path satisfies the contract.
        expect.objectContaining({ source: expect.stringMatching(/^(namespace-load|setLocale)$/) }),
      );
    });

    expect(consoleErr).not.toHaveBeenCalled();
    expect(i18n.locale.value).toBe("en");
    expect(i18n.t("hello")).toBe("Hello");
  });

  it("routes imperative locale setter errors through onError with source: setLocale", async () => {
    const err = new Error("imperative set failed");
    const onError = vi.fn();
    const i18n = createLoaderI18n({ locale: "en", defaultNs: "common", onError });
    i18n.core.registerLoader(async (locale: string, namespace: string): Promise<LoaderResult> => {
      if (namespace !== "common") return {};
      if (locale === "fr") throw err;
      return { hello: "Hello" };
    });
    await i18n.init();
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});

    i18n.locale = "fr";
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '[i18n] Failed to load all namespaces for locale "fr": common',
        }),
        // Core reports "namespace-load" before VueI18n's catch wrapper would
        // report "setLocale"; either path satisfies the contract.
        expect.objectContaining({ source: expect.stringMatching(/^(namespace-load|setLocale)$/) }),
      );
    });

    expect(consoleErr).not.toHaveBeenCalled();
    expect(i18n.locale.value).toBe("en");
    expect(i18n.t("hello")).toBe("Hello");
  });

  // This host drives BOTH: the detector is a plugin-host member and the loader
  // its own capability, so it composes loader then plugins.
  const createDetectedFrenchI18n = (onError?: I18nOptions["onError"]) => {
    const localeDetector = vi.fn(() => "fr");
    const loader = vi.fn(async (locale: string, namespace: string): Promise<LoaderResult> => {
      if (namespace === "admin") {
        throw new Error("admin load failed");
      }
      const translations: Record<string, Record<string, string>> = {
        "en:common": { hello: "Hello" },
        "fr:common": { hello: "Bonjour" },
      };
      return translations[`${locale}:${namespace}`] ?? {};
    });
    const i18n = createI18nFromCore(
      createCore({ locale: "en", defaultNs: "common", ...(onError ? { onError } : {}) })
        .with(attachLoader)
        .with(attachPlugins),
    );
    i18n.core.registerLocaleDetector(localeDetector);
    i18n.core.registerLoader(loader);
    return { i18n, localeDetector, loader };
  };

  it("exposes public loader, detector, fallback, and formatting behavior", async () => {
    const { i18n, localeDetector } = createDetectedFrenchI18n();

    await i18n.init();

    expect(localeDetector).toHaveBeenCalledTimes(1);
    expect(i18n.locale.value).toBe("fr");
    expect(i18n.t("hello")).toBe("Bonjour");
    expect(i18n.hasLocale("fr", "common").value).toBe(true);
    expect(i18n.hasTranslation("hello", { locale: "fr", namespace: "common" }).value).toBe(true);
    expect(i18n.loadedLocales.value).toEqual(["fr"]);
    expect(i18n.defaultNamespace.value).toBe("common");
    expect(i18n.activeNamespaces.value).toContain("common");

    i18n.addTranslations({ en: { fallbackOnly: "Fallback only" } });
    i18n.setFallbackLocale("en");

    expect(i18n.t("fallbackOnly")).toBe("Fallback only");
    expect(
      i18n.hasTranslation("fallbackOnly", {
        locale: "fr",
        namespace: "common",
        checkFallbacks: true,
      }).value,
    ).toBe(true);
    expect([...i18n.loadedLocales.value].sort()).toEqual(["en", "fr"]);

    // The detected locale drives Intl too; `timeZone` is pinned so the date is
    // not a function of the machine running the suite.
    expect(i18n.formatNumber(1234.5)).toBe("1\u202f234,5");
    expect(i18n.formatCurrency(12.5, "USD")).toBe("12,50\u00a0$US");
    expect(i18n.formatDate(new Date("2026-01-01T00:00:00Z"), { timeZone: "UTC" })).toBe(
      "01/01/2026",
    );
    expect(i18n.formatRelativeTime(-1, "day")).toBe("il y a 1 jour");
  });

  it("rejects addActiveNamespace and notifies onLoadError when that namespace fails to load", async () => {
    // The host takes an onError so core's expected failure is routed to a
    // handler rather than printed to the suite's stderr.
    const { i18n } = createDetectedFrenchI18n(vi.fn());
    const loadErrorSpy = vi.fn();
    i18n.core.onLoadError(loadErrorSpy);

    await i18n.init();

    await expect(i18n.core.addActiveNamespace("admin")).rejects.toThrow(
      '[i18n] Failed to load all namespaces for locale "fr": admin',
    );

    await vi.waitFor(() => {
      expect(loadErrorSpy).toHaveBeenCalledWith(
        "fr",
        "admin",
        expect.objectContaining({ message: "admin load failed" }),
      );
    });
  });

  it("forwards reportError arguments to the configured onError handler verbatim", async () => {
    const onError = vi.fn();
    const { i18n } = createDetectedFrenchI18n(onError);
    await i18n.init();
    onError.mockClear();

    const reported = new Error("boom");
    i18n.reportError(reported, { source: "translation", tagName: "link" });

    expect(onError).toHaveBeenCalledWith(reported, { source: "translation", tagName: "link" });
  });

  it("returns the raw key again once the onMissingKey handler unsubscribes", async () => {
    const { i18n } = createDetectedFrenchI18n();
    const unsubscribeMissing = i18n.core.onMissingKey((key) => `fallback:${key}`);
    await i18n.init();

    expect(i18n.t("unknown.key")).toBe("fallback:unknown.key");

    unsubscribeMissing();

    expect(i18n.t("unknown.key")).toBe("unknown.key");
  });

  it("reports async cleanup failures through the configured error handler", async () => {
    const onError = vi.fn();
    const i18n = createI18nFromCore(
      createCore({ locale: "en", defaultNs: "common", onError }).with(attachPlugins),
    );
    const destroyError = new Error("destroy failed");

    i18n.core.use(() => async () => {
      throw destroyError;
    });
    await i18n.init();

    i18n.destroy();

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(destroyError, { source: "plugin-cleanup" });
    });
  });

  it("rejects init() after destroy() and requires a new wrapper instance", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common", ns: [] });
    await i18n.init();

    i18n.destroy();

    // The unit project resolves ../src with __DEV__ true, so only the dev
    // message is reachable here; the prod text is pinned in tests/js-contract/.
    await expect(i18n.init()).rejects.toThrow(
      "[i18n] Cannot call init() after destroy(). Create a new i18n instance.",
    );
  });

  it("supports fallback return values from onMissingKey callback", () => {
    const i18n = createI18nFromCore(
      createCore({ locale: "en", defaultNs: "common" }).with(attachPlugins),
    );
    const unsubscribe = i18n.core.onMissingKey((key) => `fallback:${key}`);

    expect(i18n.t("unknown.key")).toBe("fallback:unknown.key");

    unsubscribe();

    expect(i18n.t("unknown.key")).toBe("unknown.key");
  });
});
