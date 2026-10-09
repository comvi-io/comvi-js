/**
 * A loader fetches the fallback chain, not only the active locale.
 *
 * `fallbackLocale` says where `t()` looks for a key the active locale lacks.
 * With a loader that only helps if the fallback catalogs were fetched, so every
 * namespace is loaded for the chain when it is first needed: at `init()` and on
 * activation. A locale switch then finds the chain already there and fetches
 * the target locale alone. A fallback catalog is a safety net, never a
 * requirement — its failure is reported and nothing more, and it is not
 * requested again on every switch.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import type { I18nOptions, LoaderResult } from "../../src";
import { attachLoader } from "../../src/loader";

const CATALOGS: Record<string, LoaderResult> = {
  "en:default": { a: "A-en", b: "B-en", c: "C-en" },
  "de:default": { a: "A-de", b: "B-de" },
  "de-AT:default": { a: "A-at" },
  "fr:default": { a: "A-fr" },
  "en:extra": { x: "X-en" },
  "de:extra": {},
};

function makeHost(options: I18nOptions) {
  const i18n = attachLoader(createI18n({ exposeGlobal: false, ...options }));
  const load = vi.fn(async (locale: string, namespace: string) => {
    const catalog = CATALOGS[`${locale}:${namespace}`];
    if (!catalog) throw new Error(`no catalog for ${locale}:${namespace}`);
    return catalog;
  });
  i18n.registerLoader(load);
  const loaded = () => load.mock.calls.map(([locale, namespace]) => `${locale}:${namespace}`);
  return { i18n, load, loaded };
}

describe("loader: init() and the fallback chain", () => {
  it("single fallback → its catalog is loaded and answers a key the locale lacks", async () => {
    const { i18n, loaded } = makeHost({ locale: "de", fallbackLocale: "en" });

    await i18n.init();

    expect(i18n.t("c")).toBe("C-en");
    expect(loaded().sort()).toEqual(["de:default", "en:default"]);
  });

  it("chain of two → every link is loaded, the first one holding the key answers", async () => {
    const { i18n, loaded } = makeHost({ locale: "de-AT", fallbackLocale: ["de", "en"] });

    await i18n.init();

    expect([i18n.t("a"), i18n.t("b"), i18n.t("c")]).toEqual(["A-at", "B-de", "C-en"]);
    expect(loaded().sort()).toEqual(["de-AT:default", "de:default", "en:default"]);
  });

  it("fallback equal to the locale → loaded once", async () => {
    const { i18n, loaded } = makeHost({ locale: "en", fallbackLocale: "en" });

    await i18n.init();

    expect(loaded()).toEqual(["en:default"]);
  });

  it("fallback already in the cache → not requested", async () => {
    const { i18n, loaded } = makeHost({
      locale: "de",
      fallbackLocale: "en",
      messages: { en: { c: "C-inline" } },
    });

    await i18n.init();

    expect(i18n.t("c")).toBe("C-inline");
    expect(loaded()).toEqual(["de:default"]);
  });

  it("fallback catalog fails → init resolves and the failure is reported", async () => {
    const onError = vi.fn();
    const { i18n } = makeHost({ locale: "de", fallbackLocale: "xx", onError });

    await i18n.init();

    expect(i18n.isInitialized).toBe(true);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[@comvi/core] Failed to load all namespaces for locale "xx": default',
      }),
      { source: "namespace-load", locale: "xx", namespace: "default" },
    );
  });

  it("the locale's own catalog fails → init rejects although the fallback loaded", async () => {
    const { i18n } = makeHost({ locale: "xx", fallbackLocale: "en" });

    await expect(i18n.init()).rejects.toThrow(
      '[@comvi/core] Failed to load all namespaces for locale "xx": default',
    );
  });
});

describe("loader: activation, locale switch and the fallback chain", () => {
  it("namespace activation → loaded for the locale and for the fallback", async () => {
    const { i18n, loaded } = makeHost({ locale: "de", fallbackLocale: "en", ns: [] });
    await i18n.init();

    await i18n.addActiveNamespace("extra");

    expect(i18n.t("x", { ns: "extra" })).toBe("X-en");
    expect(loaded().sort()).toEqual(["de:extra", "en:extra"]);
  });

  it("locale switch → the fallback loaded at init is not requested again", async () => {
    const { i18n, load, loaded } = makeHost({ locale: "de", fallbackLocale: "en" });
    await i18n.init();
    load.mockClear();

    await i18n.setLocale("fr");

    expect(i18n.t("c")).toBe("C-en");
    expect(loaded()).toEqual(["fr:default"]);
  });

  it("locale switch with a fallback that failed at init → the fallback is not requested again", async () => {
    const { i18n, load, loaded } = makeHost({ locale: "de", fallbackLocale: "xx" });
    await i18n.init();
    load.mockClear();

    await i18n.setLocale("fr");

    expect(loaded()).toEqual(["fr:default"]);
  });

  it("chain set after init → loaded by reloadMessages(), not by a locale switch", async () => {
    const { i18n } = makeHost({ locale: "de" });
    await i18n.init();
    i18n.setFallbackLocale("en");

    await i18n.setLocale("fr");
    const afterSwitch = i18n.t("c");
    await i18n.reloadMessages();

    expect([afterSwitch, i18n.t("c")]).toEqual(["c", "C-en"]);
  });
});
