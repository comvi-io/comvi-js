/**
 * Claims the mutation run of lot 1d found unmade: the bounded chain memo, the abort of
 * superseded loads, what destroy() releases, the exact rejection of a failed switch, and
 * view()'s slot memo and loading entries (design §2.5, R4-11, R4-15).
 */
import { describe, expect, it, vi } from "vitest";
import { CORE, MS, createI18n } from "../../src/instance";
import { coming, loading, state, translate, view } from "../../src/internal";
import { flush, make, manualLoader } from "./helpers";

describe("the chain memo", () => {
  it("keeps 500 chains, then starts over (a per-call locale may be user input)", () => {
    const i18n = createI18n({ locale: "en", onError: () => {} });
    const core = CORE.get(i18n)!;
    const en = core.ch("en"); // 1 chain: the start locale's
    for (let i = 2; i <= 500; i++) core.ch(`en-x-n${i}`);
    expect(core.ch("en")).toBe(en);
    core.ch("en-x-n501");
    const again = core.ch("en");
    expect(again).not.toBe(en);
    expect(again).toEqual(en);
    expect(core.ch("en")).toBe(again);
  });

  it("lists each locale once, however the fallbacks repeat it", () => {
    const i18n = createI18n({ locale: "de-AT", fallbackLocale: ["de", "en", "de-AT", "en"] });
    const ch = CORE.get(i18n)!.ch("de-AT");
    expect(ch.map((x) => x[0])).toEqual(["de-AT", "de", "en"]);
    expect(ch.o).toBe(2);
  });
});

describe("setLocale() and the loads it supersedes", () => {
  it("aborts the loads of a locale outside the new chain inside the call", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    void i18n.setLocale("de");
    await flush();
    void i18n.setLocale("fr");
    expect(l.signals.get("de:default")!.aborted).toBe(true);
  });

  it("keeps a load of the target's own chain: a repeated switch loads once", async () => {
    const l = manualLoader({ "de:default": { a: "A" }, "en:default": {} });
    const { i18n } = make({
      locale: "uk",
      fallbackLocale: "en",
      messages: { uk: {} },
      loader: l.load,
    });
    await l.answer("en:default");
    const a = i18n.setLocale("de");
    await flush();
    const b = i18n.setLocale("de");
    await flush();
    expect(l.requested).toEqual(["en:default", "de:default"]);
    expect(l.signals.get("de:default")!.aborted).toBe(false);
    await l.answer("de:default");
    await Promise.all([a, b]);
    expect(i18n.t("a")).toBe("A");
  });

  it("rejects with the target's own load error, also for a namespace no catalog has", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: ["shop"], loader: l.load });
    await l.fail("en:shop");
    const boom = new Error("404 fr");
    const p = i18n.setLocale("fr");
    await l.fail("fr:shop", boom);
    await expect(p).rejects.toBe(boom);
  });

  it("rejects an invalid locale with a message that names it", async () => {
    const { i18n } = make({ locale: "en" });
    await expect(i18n.setLocale("a/b")).rejects.toThrow('[@comvi/core] invalid locale "a/b"');
  });

  it("after destroy() ignores even an invalid locale: no rejection, no report", async () => {
    const { i18n, errors } = make({ locale: "en" });
    i18n.destroy();
    await expect(i18n.setLocale("a/b")).resolves.toBeUndefined();
    expect(errors).toEqual([]);
  });
});

describe("destroy()", () => {
  it("leaves nothing in flight: `ready` is the resolved promise of an idle instance", () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    expect(i18n.ready).not.toBe(createI18n({ locale: "en" }).ready);
    i18n.destroy();
    expect(i18n.ready).toBe(createI18n({ locale: "en" }).ready);
  });

  it("drops every subscriber: a later publish reaches none", () => {
    // The setter `devtools()` reads during its setup (instance.ts `MS`, keyed by instance).
    const i18n = createI18n({ locale: "en" });
    const mark = MS.get(i18n)!;
    const sub = vi.fn();
    i18n.on(sub);
    i18n.destroy();
    mark(null); // the one publish that is not guarded by destroy()
    expect(sub).not.toHaveBeenCalled();
  });
});

describe("view() internals", () => {
  it("layers one extra catalog over two different slots without mixing them up", () => {
    const { i18n } = make({ locale: "en", messages: { en: { a: "A1", b: "B1" } } });
    const extra = { a: "view" };
    // A view onto a pair with no slot yet, layering the same catalog object first.
    expect(
      translate(i18n, view(i18n, state(i18n), { shop: { en: extra } }), "a", { ns: "shop" }),
    ).toBe("view");
    const v1 = view(i18n, state(i18n), { default: { en: extra } });
    expect(translate(i18n, v1, "b")).toBe("B1");
    i18n.add("en", { b: "B2" });
    const v2 = view(i18n, state(i18n), { default: { en: extra } });
    expect([translate(i18n, v2, "a"), translate(i18n, v2, "b")]).toEqual(["view", "B2"]);
  });

  it("in the published locale adds no loading entry for a fallback still missing", () => {
    const { i18n } = make({
      locale: "en",
      fallbackLocale: "de",
      messages: { en: { a: "A" } },
      loader: () => new Promise(() => {}),
    });
    const s = state(i18n);
    const v = view(i18n, { ...s, ld: [] }, { default: { en: { a: "V" } } });
    expect(v.ld).toEqual([]);
  });

  it("in another locale lists an active namespace that has no catalog at all", () => {
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "shop"],
      messages: { en: { a: "A" } },
      loader: () => new Promise(() => {}),
    });
    const v = view(i18n, { ...state(i18n), ld: [] }, {}, "de");
    expect(v.ld).toEqual(["de\0default", "de\0shop"]);
    expect(loading(v, "shop")).toBe(true);
    expect(loading(v, "hop")).toBe(false);
  });

  it("lists a load already in flight once", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    void i18n.setLocale("de");
    await flush();
    expect(state(i18n).ld).toEqual(["de\0default"]);
    expect(view(i18n, state(i18n), {}, "de").ld).toEqual(["de\0default"]);
  });

  it("an invalid locale renders left to right", () => {
    const { i18n } = make({ locale: "ar", messages: { ar: {} } });
    expect(view(i18n, state(i18n), {}, "a/b").dir).toBe("ltr");
  });
});

describe("coming(i18n, state, ns)", () => {
  it("is a boolean: true while a namespace is still coming, false once it is in place", async () => {
    const l = manualLoader({ "en:shop": { s: "S" } });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    expect(coming(i18n, state(i18n), "shop")).toBe(true);
    expect(coming(i18n, state(i18n), "default")).toBe(false);
    const p = i18n.load("shop");
    await l.answer("en:shop");
    await p;
    expect(coming(i18n, state(i18n), "shop")).toBe(false);
  });
});
