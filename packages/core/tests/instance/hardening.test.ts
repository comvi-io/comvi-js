/**
 * Invariants added by the lot-1b review fix pass. Each was seen red first (R4-22) by
 * planting the defect it names; the commit message records which plant failed which test.
 */
import { describe, expect, it, vi } from "vitest";
import type { I18nError } from "../../src/errors";
import { createI18n } from "../../src/instance";
import { acquire, loading, state, translate, view } from "../../src/internal";
import { flush, make, manualLoader, tableLoader } from "./helpers";

describe("add() of the catalog a slot already holds is a no-op (H5 livelock class)", () => {
  it("re-adding the same object: no publish, rev unchanged, slot and record kept", () => {
    const en: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) en["k" + i] = "v" + i;
    const { i18n } = make({ locale: "en" });
    i18n.add("en", en);
    const s = state(i18n);
    const sub = vi.fn();
    i18n.on(sub);
    i18n.add("en", en);
    i18n.add("en", en);
    expect(sub).not.toHaveBeenCalled();
    expect(i18n.rev()).toBe(s.rev);
    expect(state(i18n)).toBe(s);
    expect(state(i18n).c.default.en.m).toBe(en);
    expect(state(i18n).pr).toBe(s.pr);
  });

  it("view() with the catalog the slot holds gives back the state itself", () => {
    const en = { a: "A" };
    const { i18n } = make({ locale: "en", messages: { en } });
    const s = state(i18n);
    expect(view(i18n, s, { default: { en } })).toBe(s);
  });

  it("add() under an invalid locale publishes nothing", () => {
    const { i18n, errors } = make({ locale: "en" });
    const sub = vi.fn();
    i18n.on(sub);
    i18n.add("!!", { a: "A" });
    expect(sub).not.toHaveBeenCalled();
    expect(errors.map((e) => e.code)).toEqual(["invalid_locale"]);
  });
});

describe("ready is one promise per set of loads in flight (Suspense-safe)", () => {
  it("the same object while the set does not change; a shared resolved one when idle", async () => {
    const idle = createI18n({ locale: "en" });
    expect(idle.ready).toBe(idle.ready);
    expect(idle.ready).toBe(createI18n({ locale: "de" }).ready);

    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    const a = i18n.ready;
    expect(i18n.ready).toBe(a);
    i18n.t("x"); // reads do not change it
    expect(i18n.ready).toBe(a);
    const loadShop = i18n.load("shop"); // the set changes
    const b = i18n.ready;
    expect(b).not.toBe(a);
    expect(i18n.ready).toBe(b);
    await l.answer("en:default");
    await l.answer("en:shop");
    await loadShop;
    await expect(b).resolves.toBeUndefined();
    expect(i18n.ready).toBe(idle.ready);
  });
});

describe("partial failure counts the target's own chain (R4-11)", () => {
  it("de-AT 404 with de in place switches to de-AT, rendering de", async () => {
    const t = tableLoader({ "en:default": { a: "A-en" }, "de:default": { a: "A-de" } });
    const { i18n, errors } = make({ locale: "en", fallbackLocale: "en", loader: t.load });
    await i18n.ready;
    await i18n.setLocale("de-AT");
    expect(i18n.locale).toBe("de-AT");
    expect(i18n.t("a")).toBe("A-de");
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "load_failed", locale: "de-AT" }),
    );
  });

  it("still rejects when nothing of the target's own chain loaded (the fallback does not count)", async () => {
    const t = tableLoader({ "en:default": { a: "A-en" } });
    const { i18n } = make({ locale: "en", fallbackLocale: "en", loader: t.load });
    await i18n.ready;
    await expect(i18n.setLocale("de-AT")).rejects.toThrow(/de-AT:default/);
    expect(i18n.locale).toBe("en");
  });
});

describe("a namespace held while a switch is pending (setLocale contract point 5, lot 4c)", () => {
  it("does not hold the switch; it loads for the old locale, then for the target right after", async () => {
    const l = manualLoader({ "fr:default": { a: "A-fr" }, "fr:shop": { s: "S-fr" } });
    const { i18n } = make({ locale: "en", messages: { en: { a: "A-en" } }, loader: l.load });
    const sw = i18n.setLocale("fr");
    expect(l.requested).toEqual(["fr:default"]);
    // A component mounting now (its hold).
    acquire(i18n, "shop");
    expect(l.requested).toEqual(["fr:default", "en:shop"]);
    await l.answer("fr:default");
    await sw;
    // The switch waited for the namespaces active at the call only.
    expect(i18n.locale).toBe("fr");
    expect(i18n.t("a")).toBe("A-fr");
    // The old locale's load is obsolete; the active need reacts to the new locale.
    expect(l.signals.get("en:shop")!.aborted).toBe(true);
    expect(l.requested).toEqual(["fr:default", "en:shop", "fr:shop"]);
    expect(loading(state(i18n), "shop")).toBe(true);
    await l.answer("fr:shop");
    expect(i18n.t("s", { ns: "shop" })).toBe("S-fr");
    expect(loading(state(i18n))).toBe(false);
  });

  it("a load(ns) started meanwhile pins nothing: aborted by the switch, it resolves and the target does not load ns", async () => {
    const l = manualLoader({ "fr:default": { a: "A-fr" } });
    const { i18n } = make({ locale: "en", messages: { en: { a: "A-en" } }, loader: l.load });
    const sw = i18n.setLocale("fr");
    const shop = i18n.load("shop");
    expect(l.requested).toEqual(["fr:default", "en:shop"]);
    await l.answer("fr:default");
    await sw;
    expect(l.signals.get("en:shop")!.aborted).toBe(true);
    await expect(shop).resolves.toBeUndefined();
    // Nobody holds shop: the new locale does not load it.
    expect(l.requested).toEqual(["fr:default", "en:shop"]);
    expect(loading(state(i18n), "shop")).toBe(false);
  });

  it("a rejected switch loads again what its start aborted for the locale kept on screen", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      messages: { en: { a: "A-en" } },
      loader: l.load,
    });
    acquire(i18n, "shop"); // en:shop in flight
    const sw = i18n.setLocale("fr"); // aborts en:shop (outside fr's chain)
    expect(l.signals.get("en:shop")!.aborted).toBe(true);
    await l.fail("fr:default");
    await l.fail("fr:shop");
    await expect(sw).rejects.toThrow("404 fr:default");
    expect(i18n.locale).toBe("en");
    // en:shop asked for again: the consumer is not left loading forever.
    expect(l.requested.filter((k) => k == "en:shop")).toHaveLength(2);
    await l.answer("en:shop", { s: "S-en" });
    expect(i18n.t("s", { ns: "shop" })).toBe("S-en");
    expect(loading(state(i18n), "shop")).toBe(false);
  });
});

describe("starting loads publishes once", () => {
  it("setLocale() with 3 namespaces × 2 chain entries: one synchronous loading state", () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      fallbackLocale: "en",
      namespaces: ["default", "a", "b"],
      messages: { en: {} },
      catalogs: { a: { en: {} }, b: { en: {} } },
      loader: l.load,
    });
    const sub = vi.fn();
    i18n.on(sub);
    void i18n.setLocale("de-AT");
    expect(l.requested).toHaveLength(6);
    expect(sub).toHaveBeenCalledTimes(1);
    expect(state(i18n).ld).toHaveLength(6);
  });
});

describe("the reporter is isolated", () => {
  const thrower = () => {
    throw new Error("reporter");
  };

  it("a throwing onError does not break t(); its error is rethrown outside", () => {
    vi.useFakeTimers();
    try {
      const i18n = createI18n({ locale: "en", messages: { en: { p: "{x}" } }, onError: thrower });
      expect(i18n.t("missing")).toBe("missing");
      expect(i18n.t("p")).toBe("{x}");
      expect(() => vi.runAllTimers()).toThrow("reporter");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a throwing onError does not strand a failed load: loading clears, ready resolves", async () => {
    vi.useFakeTimers();
    try {
      const i18n = createI18n({
        locale: "en",
        onError: thrower,
        loader: () => Promise.reject(new Error("404")),
      });
      await flush();
      await expect(i18n.ready).resolves.toBeUndefined();
      expect(loading(state(i18n))).toBe(false);
      expect(() => vi.runAllTimers()).toThrow("reporter");
    } finally {
      vi.useRealTimers();
    }
  });

  it("an onError that calls has()/t() does not change what the outer t() renders", () => {
    let inner = false;
    const { i18n } = make({
      locale: "de",
      fallbackLocale: "en",
      messages: { en: { a: "A", b: "B" }, de: {} },
      onError: (e) => {
        if (e.code === "fallback_used" && !inner) {
          inner = true;
          i18n.has("b");
          i18n.t("b");
          inner = false;
        }
      },
    });
    expect(i18n.t("a")).toBe("A");
  });
});

describe("defaultParams belong to a snapshot", () => {
  const messages = { en: { hi: "Hi {name}" } };

  it("the caller mutating its object changes nothing, even at rev 0", () => {
    const dp = { name: "Ann" };
    const { i18n } = make({ locale: "en", messages, defaultParams: dp });
    dp.name = "Bob";
    expect(i18n.rev()).toBe(0);
    expect(i18n.t("hi")).toBe("Hi Ann");
    const next = { name: "Cy" };
    i18n.setDefaultParams(next);
    next.name = "Dee";
    expect(i18n.t("hi")).toBe("Hi Cy");
  });

  it("an older snapshot (and a view of it) keeps the defaults it was published with", () => {
    const { i18n } = make({ locale: "en", messages, defaultParams: { name: "Old" } });
    const old = state(i18n);
    const v = view(i18n, old, { extra: { en: { x: "X" } } });
    i18n.setDefaultParams({ name: "New" });
    expect(translate(i18n, old, "hi")).toBe("Hi Old");
    expect(translate(i18n, v, "hi")).toBe("Hi Old");
    expect(i18n.t("hi")).toBe("Hi New");
  });

  it("setDefaultParams() after destroy() changes nothing", () => {
    const { i18n } = make({ locale: "en", messages, defaultParams: { name: "Ann" } });
    i18n.destroy();
    i18n.setDefaultParams({ name: "Bob" });
    expect(i18n.t("hi")).toBe("Hi Ann");
  });
});

describe("fallbackLocale is owned by the instance", () => {
  it("mutating the caller's list before another locale's first lookup changes nothing", () => {
    const list = ["en"];
    const map = { default: ["en"] };
    const messages = { en: { a: "A-en" }, fr: { a: "A-fr" } };
    const a = make({ locale: "de", fallbackLocale: list, messages }).i18n;
    const b = make({ locale: "de", fallbackLocale: map, messages }).i18n;
    list[0] = "fr";
    map.default[0] = "fr";
    expect(a.t("a", { locale: "uk" })).toBe("A-en");
    expect(b.t("a", { locale: "uk" })).toBe("A-en");
  });

  it("an invalid fallbackLocale entry is reported, not dropped silently", () => {
    const { errors } = make({ locale: "en", fallbackLocale: ["!!", "de"] });
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "invalid_locale", locale: "!!" }),
    );
  });

  it("has() with an invalid locale reports invalid_locale", () => {
    const { i18n, errors } = make({ locale: "en", messages: { en: { a: "A" } } });
    expect(i18n.has("a", { locale: "x_y_!!" })).toBe(false);
    expect(errors.map((e: I18nError) => e.code)).toContain("invalid_locale");
  });
});

describe("missing_key waits for every load of the namespace", () => {
  it("de-AT settled (404) but de still loading: a key de will answer is not reported", async () => {
    const l = manualLoader({ "de:default": { a: "A-de" } });
    const { i18n, errors } = make({ locale: "de-AT", loader: l.load });
    expect(l.requested).toEqual(["de-AT:default", "de:default"]);
    await l.fail("de-AT:default");
    expect(i18n.t("a")).toBe("a");
    expect(errors.filter((e) => e.code === "missing_key")).toEqual([]);
    await l.answer("de:default");
    expect(i18n.t("a")).toBe("A-de");
    await flush();
  });
  it("a namespace with no catalog of the chain (another locale's only) is not missing while a loader could bring one; failed, it is load_failed only (owner 30.10)", async () => {
    const l = manualLoader({ "en:shop": { title: "Shop" } });
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: {} },
      catalogs: { cart: { de: { n: "Korb" } } },
      loader: l.load,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(i18n.ns("shop")("title")).toBe("title");
    expect(i18n.ns("cart")("n")).toBe("n"); // a catalog of another locale only
    expect(errors.filter((e) => e.code === "missing_key")).toEqual([]);
    const p = i18n.load("shop");
    await l.fail("en:shop");
    await expect(p).rejects.toThrow("404 en:shop");
    expect(i18n.ns("shop")("title")).toBe("title");
    expect(errors.map((e) => e.code)).toEqual(["load_failed"]);
    warn.mockRestore();
  });

  it("missing_key needs a catalog of the chain in place: without one (no loader either) a read reports nothing; with one and nothing in flight an absent key is reported (owner 30.10)", () => {
    const { i18n, errors } = make({ locale: "en", messages: { en: {} } });
    expect(i18n.ns("shop")("title")).toBe("title");
    expect(errors).toEqual([]);
    expect(i18n.t("title")).toBe("title");
    expect(errors).toEqual([expect.objectContaining({ code: "missing_key", ns: "default" })]);
  });
});
