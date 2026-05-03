import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";

describe("Core API Contracts", () => {
  it("emits loadError from locale setter when async locale load fails", async () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    i18n.registerLoader(async (lang, ns) => {
      if (lang === "fr" && ns === "default") {
        throw new Error("load failed");
      }
      return { key: `${lang}:${ns}` };
    });

    await i18n.init();

    const onLoadError = vi.fn();
    i18n.on("loadError", onLoadError);

    i18n.locale = "fr";

    await vi.waitFor(() => {
      expect(
        onLoadError.mock.calls.some(
          ([payload]) => payload?.locale === "fr" && payload?.namespace === "locale-change",
        ),
      ).toBe(true);
    });

    expect(onLoadError.mock.calls.map(([payload]) => payload.namespace)).toContain("default");
    expect(onLoadError.mock.calls.map(([payload]) => payload.namespace)).toContain("locale-change");
    expect(i18n.locale).toBe("en");
  });

  it("respects checkFallbacks in hasTranslation()", () => {
    const i18n = new I18n({
      locale: "de",
      fallbackLocale: ["de", "en"],
      exposeGlobal: false,
    });
    i18n.addTranslations({ en: { hello: "Hello" } });

    expect(i18n.hasTranslation("hello", "de", "default", false)).toBe(false);
    expect(i18n.hasTranslation("hello", "de", "default", true)).toBe(true);
  });

  it("validates registerLocaleDetector() argument type", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    expect(() => i18n.registerLocaleDetector("invalid" as any)).toThrow(
      /registerLocaleDetector\(\).*function|E_REGISTER_LOCALE_DETECTOR/,
    );
  });

  it("validates registerLoader() argument type", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    expect(() => i18n.registerLoader(123 as any)).toThrow(
      /registerLoader\(\).*function or an import map|E_REGISTER_LOADER_ARG/,
    );
  });

  it("stores and retrieves plugin data", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    i18n.setPluginData("fetch-loader", { enabled: true, retries: 2 });

    expect(i18n.getPluginData("fetch-loader")).toEqual({ enabled: true, retries: 2 });
    expect(i18n.getPluginData("missing")).toBeUndefined();
  });

  it("reports the same Error instance only once", () => {
    const onError = vi.fn();
    const i18n = new I18n({ locale: "en", onError, exposeGlobal: false });
    const err = new Error("dedupe me");

    i18n.reportError(err, { source: "init" });
    i18n.reportError(err, { source: "init" });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err, { source: "init" });
  });

  it("does not throw when onError handler itself throws", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = new I18n({
      locale: "en",
      exposeGlobal: false,
      onError: () => {
        throw new Error("onError failed");
      },
    });

    i18n.reportError(new Error("original"), { source: "init" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[i18n] onError handler threw: onError failed"),
    );

    warnSpy.mockRestore();
  });

  it("registers and unregisters instance in window.__COMVI__", async () => {
    const id = `core-contract-${Date.now()}`;
    const i18n = new I18n({
      locale: "en",
      exposeGlobal: true,
      instanceId: id,
    });

    const globalRef = (window as any).__COMVI__;
    expect(i18n.instanceId).toBe(id);
    expect(globalRef?.get(id)).toBe(i18n);

    await i18n.destroy();

    expect(globalRef?.get(id)).toBeUndefined();
    await expect(i18n.init()).rejects.toThrow(/destroy|E_INSTANCE_DESTROYED/);
    expect(globalRef?.get(id)).toBeUndefined();
  });

  it("supports exposeGlobal in SSR-like environments without window", async () => {
    const originalWindow = (globalThis as any).window;
    const originalCustomEvent = (globalThis as any).CustomEvent;

    vi.stubGlobal("window", undefined);
    vi.stubGlobal("CustomEvent", undefined);

    try {
      const i18n = new I18n({
        locale: "en",
        exposeGlobal: true,
        instanceId: "ssr-instance",
      });

      expect(i18n.instanceId).toBe("ssr-instance");
      await i18n.destroy();
      expect(i18n.isInitialized).toBe(false);
    } finally {
      vi.stubGlobal("window", originalWindow);
      vi.stubGlobal("CustomEvent", originalCustomEvent);
      vi.unstubAllGlobals();
    }
  });
});
