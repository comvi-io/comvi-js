/**
 * Lot 4b (owner brief 29.10, part A): the contracts of `setLocale()` and `load()`, one test
 * per point. The binding scenarios (`packages/react/tests/scenario.test.tsx`,
 * `packages/vue/tests/scenario.test.ts`) run the same cases through a README component.
 */
import { describe, expect, it } from "vitest";
import { acquire, coming, loading, state } from "../../src/internal";
import { make, manualLoader, tableLoader } from "./helpers";

describe("setLocale() contract (lot 4b)", () => {
  it("1 · waits for the namespaces active at the call", async () => {
    const l = manualLoader({ "fr:default": { a: "A-fr" }, "fr:shop": { s: "S-fr" } });
    const { i18n } = make({
      locale: "en",
      messages: { en: { a: "A-en" } },
      catalogs: { shop: { en: { s: "S-en" } } },
      namespaces: ["default", "shop"],
      loader: l.load,
    });
    const sw = i18n.setLocale("fr");
    expect(l.requested.sort()).toEqual(["fr:default", "fr:shop"]);
    await l.answer("fr:default");
    expect(i18n.locale).toBe("en"); // shop was active at the call: it waits for it
    await l.answer("fr:shop");
    await sw;
    expect(i18n.locale).toBe("fr");
    expect(i18n.t("s", { ns: "shop" })).toBe("S-fr");
  });

  it("2 · the current locale renders until the target's catalogs are in", async () => {
    const l = manualLoader({ "de:default": { a: "A-de" } });
    const { i18n } = make({ locale: "en", messages: { en: { a: "A-en" } }, loader: l.load });
    const sw = i18n.setLocale("de");
    expect(i18n.locale).toBe("en");
    expect(i18n.t("a")).toBe("A-en");
    expect(loading(state(i18n))).toBe(true);
    await l.answer("de:default");
    await sw;
    expect(i18n.t("a")).toBe("A-de");
  });

  it("a target that needs nothing switches inside the call", () => {
    const { i18n } = make({ locale: "en", messages: { en: { a: "A" }, de: { a: "B" } } });
    void i18n.setLocale("de");
    expect(i18n.locale).toBe("de");
  });

  it("3, 4, 6 · a later call wins; the superseded one resolves, aborted and unreported, and never switches", async () => {
    const l = manualLoader({ "de:default": { a: "A-de" }, "uk:default": { a: "A-uk" } });
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { a: "A-en" } },
      loader: l.load,
    });
    const de = i18n.setLocale("de");
    const uk = i18n.setLocale("uk");
    expect(l.signals.get("de:default")!.aborted).toBe(true);
    await expect(de).resolves.toBeUndefined();
    expect(i18n.locale).toBe("en");
    await l.answer("uk:default");
    await expect(uk).resolves.toBeUndefined();
    expect(i18n.locale).toBe("uk");
    expect(errors).toEqual([]);
  });

  it("4 · a superseded call whose shared load lands first does not switch", async () => {
    const l = manualLoader({ "pt:default": { a: "A-pt" } });
    const { i18n } = make({ locale: "en", messages: { en: { a: "A-en" } }, loader: l.load });
    const ptBR = i18n.setLocale("pt-BR"); // pt-BR, then its parent pt
    const pt = i18n.setLocale("pt"); // shares the pt flight, aborts pt-BR's own
    expect(l.signals.get("pt-BR:default")!.aborted).toBe(true);
    await l.answer("pt:default");
    await Promise.all([ptBR, pt]);
    expect(i18n.locale).toBe("pt");
  });

  it("4 · switching back to the locale on screen during a pending switch cancels it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: { a: "A-en" } }, loader: l.load });
    const de = i18n.setLocale("de");
    await i18n.setLocale("en"); // needs nothing: settles inside the call
    expect(l.signals.get("de:default")!.aborted).toBe(true);
    await expect(de).resolves.toBeUndefined();
    expect(i18n.locale).toBe("en");
    expect(loading(state(i18n))).toBe(false);
  });

  it("6 · a superseded call resolves even when its target failed; the latest call rejects", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { a: "A-en" } },
      loader: l.load,
    });
    const ptBR = i18n.setLocale("pt-BR");
    const pt = i18n.setLocale("pt");
    await l.fail("pt:default", new Error("404 pt"));
    await expect(ptBR).resolves.toBeUndefined();
    await expect(pt).rejects.toThrow("404 pt");
    expect(i18n.locale).toBe("en");
    // Reported once, for the pair that failed; the aborted pt-BR load is not reported.
    expect(errors.map((e) => [e.code, e.locale])).toEqual([["load_failed", "pt"]]);
  });

  it("6 · rejects with the loader's error only when no catalog of the target's own chain loaded", async () => {
    const t = tableLoader({ "en:default": { a: "A-en" }, "de:default": { a: "A-de" } });
    const { i18n } = make({ locale: "en", fallbackLocale: "en", loader: t.load });
    await i18n.ready;
    await expect(i18n.setLocale("fr")).rejects.toThrow("no catalog for fr:default");
    expect(i18n.locale).toBe("en");
    await expect(i18n.setLocale("de-AT")).resolves.toBeUndefined(); // de is in its own chain
    expect(i18n.t("a")).toBe("A-de");
  });

  it("6 · an invalid tag rejects with a RangeError and requests nothing", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    await expect(i18n.setLocale("!!")).rejects.toThrow(RangeError);
    expect(l.requested).toEqual([]);
  });
});

describe("load(ns) contract (lot 4b)", () => {
  it("resolves once the namespace is in", async () => {
    const t = tableLoader({ "en:shop": { s: "S" } });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: t.load });
    await expect(i18n.load("shop")).resolves.toBeUndefined();
    expect(i18n.t("s", { ns: "shop" })).toBe("S");
  });

  it("resolves when there is nothing to load (inline catalogs, no loader)", async () => {
    const { i18n } = make({ locale: "en", catalogs: { shop: { en: { s: "S" } } } });
    await expect(i18n.load("shop")).resolves.toBeUndefined();
    await expect(i18n.load("other")).resolves.toBeUndefined(); // nothing can load it
  });

  it("rejects with the loader's error when nothing of the locale's own chain loaded; renders the fallback", async () => {
    const t = tableLoader({ "en:shop": { s: "S-en" } });
    const { i18n, errors } = make({
      locale: "de",
      fallbackLocale: "en",
      messages: { de: {}, en: {} },
      loader: t.load,
    });
    await expect(i18n.load("shop")).rejects.toThrow("no catalog for de:shop");
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "load_failed", locale: "de", ns: "shop" }),
    );
    expect(i18n.t("s", { ns: "shop" })).toBe("S-en");
    expect(coming(i18n, state(i18n), "shop")).toBe(false); // no placeholder forever
  });

  it("resolves when a parent of the locale has the namespace (de-AT 404, de in place)", async () => {
    const t = tableLoader({ "de:shop": { s: "S-de" } });
    const { i18n } = make({ locale: "de-AT", messages: { "de-AT": {} }, loader: t.load });
    await expect(i18n.load("shop")).resolves.toBeUndefined();
    expect(i18n.t("s", { ns: "shop" })).toBe("S-de");
  });

  it("a binding's hold never rejects, even when the load fails (lot 4c: it returns the release)", async () => {
    const t = tableLoader({});
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: t.load });
    expect(acquire(i18n, "shop")).toBeTypeOf("function");
    await expect(i18n.ready).resolves.toBeUndefined();
    // load() is the explicit retry: it asks again and reports the outcome.
    await expect(i18n.load("shop")).rejects.toThrow("no catalog for en:shop");
    expect(t.loaded()).toEqual(["en:shop", "en:shop"]);
  });
});
