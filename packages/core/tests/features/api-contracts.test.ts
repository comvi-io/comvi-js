import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { I18n } from "../helpers/composedHost";

// `__DEV__` is defined true by vitest.config.ts, so the DEV branch of every
// error message below is the one this suite observes.
describe("I18n core API contracts", () => {
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

    expect(onLoadError.mock.calls.map(([payload]) => payload.namespace).sort()).toEqual([
      "default",
      "locale-change",
    ]);
    expect(i18n.locale).toBe("en");
  });

  describe("hasTranslation()", () => {
    function makeI18n() {
      const i18n = new I18n({ locale: "de", fallbackLocale: ["de", "en"], exposeGlobal: false });
      i18n.addTranslations({ en: { hello: "Hello" } });
      return i18n;
    }

    it("respects checkFallbacks in hasTranslation()", () => {
      const i18n = makeI18n();

      expect(i18n.hasTranslation("hello", "de", "default", false)).toBe(false);
      expect(i18n.hasTranslation("hello", "de", "default", true)).toBe(true);
    });

    it("returns false for a locale that was never loaded, fallbacks or not", () => {
      const i18n = makeI18n();

      expect(i18n.hasTranslation("hello", "ja", "default", false)).toBe(false);
      // "ja" is not in the fallback chain, but "en" is — the chain is consulted
      // regardless of the requested locale.
      expect(i18n.hasTranslation("hello", "ja", "default", true)).toBe(true);
    });

    it("returns false for an empty key", () => {
      const i18n = makeI18n();

      expect(i18n.hasTranslation("", "en", "default", false)).toBe(false);
      expect(i18n.hasTranslation("", "en", "default", true)).toBe(false);
    });
  });

  it("validates registerLocaleDetector() argument type", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    expect(() => i18n.registerLocaleDetector("invalid" as any)).toThrow(
      "[i18n] registerLocaleDetector(): argument must be a function.",
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

    expect(() => i18n.reportError(new Error("original"), { source: "init" })).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[i18n] onError handler threw: onError failed"),
    );
  });

  describe("window.__COMVI__ discovery queue", () => {
    let previousGlobal: unknown;

    beforeEach(() => {
      previousGlobal = (window as { __COMVI__?: unknown }).__COMVI__;
      delete (window as { __COMVI__?: unknown }).__COMVI__;
    });

    afterEach(() => {
      (window as { __COMVI__?: unknown }).__COMVI__ = previousGlobal;
    });

    it("pushes its queue entry on construction and removes it on destroy()", async () => {
      // `Date.now()` only makes the id unique; it never influences an assertion.
      const id = `core-contract-${Date.now()}`;
      const i18n = new I18n({ locale: "en", exposeGlobal: true, instanceId: id });

      const queue = (window as { __COMVI__?: Array<{ v: string; i: unknown }> }).__COMVI__;
      expect(i18n.instanceId).toBe(id);
      expect(Array.isArray(queue)).toBe(true);
      expect(queue!.some((entry) => entry.i === i18n)).toBe(true);

      await i18n.destroy();

      expect(queue!.some((entry) => entry.i === i18n)).toBe(false);
    });

    it("does not re-push the entry when init() is rejected after destroy()", async () => {
      const i18n = new I18n({
        locale: "en",
        exposeGlobal: true,
        instanceId: `core-contract-rejected-${Date.now()}`,
      });
      const queue = (window as { __COMVI__?: Array<{ v: string; i: unknown }> }).__COMVI__!;
      await i18n.destroy();

      await expect(i18n.init()).rejects.toThrow(/Cannot call init\(\) after destroy\(\)/);

      expect(queue.some((entry) => entry.i === i18n)).toBe(false);
    });
  });

  it("constructs and destroys with exposeGlobal in an SSR-like environment without window", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("CustomEvent", undefined);

    const i18n = new I18n({ locale: "en", exposeGlobal: true, instanceId: "ssr-instance" });

    expect(i18n.instanceId).toBe("ssr-instance");
    await expect(i18n.destroy()).resolves.toBeUndefined();
  });
});
