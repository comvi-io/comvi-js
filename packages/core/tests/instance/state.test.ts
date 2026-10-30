/**
 * The snapshot contract (design §2.5, R4-12, R4-15, R4-17): on()/rev(), `lrev`, read paths
 * that never publish, view() and SSR isolation.
 * Ported by meaning from 0.7: with-messages (→ view()), lifecycle (loading states).
 * New in 1b: sync emit in a read path (R4-17), SSR singleton bleed (R4-12).
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n, type I18n } from "../../src/instance";
import { acquire, coming, loading, state, translate, view } from "../../src/internal";
import { flush, make, manualLoader } from "./helpers";

describe("on() / rev()", () => {
  it("every published change moves rev; lrev moves on a locale change only", async () => {
    const { i18n } = make({ locale: "en", messages: { de: {} } });
    expect([i18n.rev(), state(i18n).lrev]).toEqual([0, 0]);
    i18n.add("en", { a: "A" });
    expect([i18n.rev(), state(i18n).lrev]).toEqual([1, 0]);
    await i18n.setLocale("de");
    expect([i18n.rev(), state(i18n).lrev]).toEqual([2, 1]);
    await i18n.setLocale("en");
    expect(state(i18n).lrev).toBe(2);
  });

  it("each state is a new immutable object; untouched namespaces keep their identity", () => {
    const { i18n } = make({ locale: "en", catalogs: { shop: { en: { s: "S" } } } });
    const a = state(i18n);
    i18n.add("en", { a: "A" });
    const b = state(i18n);
    expect(b).not.toBe(a);
    expect(b.c.shop).toBe(a.c.shop);
    expect(a.c.default).toBeUndefined();
  });

  it("loading(state, ns) reflects the flights of that namespace", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const p = i18n.load("shop");
    expect([loading(state(i18n)), loading(state(i18n), "shop"), loading(state(i18n), "x")]).toEqual(
      [true, true, false],
    );
    await l.answer("en:shop");
    await p;
    expect(loading(state(i18n))).toBe(false);
  });
});

/**
 * R4-17: no read path publishes synchronously — a binding may read inside a reactive
 * derivation (Svelte `$derived`: `state_unsafe_mutation`). Every read below runs with a
 * subscriber that counts the publishes that happen DURING the read.
 */
describe("read paths never publish (R4-17)", () => {
  const reads = (i18n: I18n) => [
    () => i18n.t("missing"),
    () => i18n.t("a", { ns: "notloaded" }),
    () => i18n.t("a", { locale: "fr" }),
    () => i18n.t("a", { locale: "!!" }),
    () => i18n.t("p"),
    () => i18n.ns("other")("x"),
    () => i18n.has("a", { ns: "notloaded", locale: "de" }),
    () => i18n.locale,
    () => i18n.dir,
    () => i18n.ready,
    () => i18n.rev(),
    () => translate(i18n, state(i18n), "missing", undefined, "notloaded"),
    () => view(i18n, state(i18n), { notloaded: { en: { a: "A" } } }),
  ];

  /** Publishes counted DURING read `i` of `wrap(i18n)`. */
  const during = async (i: number, wrap: (i18n: I18n) => I18n = (x) => x) => {
    const { load } = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: { p: "{x}" } }, loader: load });
    let inRead = false;
    let n = 0;
    i18n.on(() => {
      if (inRead) n++;
    });
    const read = reads(wrap(i18n))[i];
    inRead = true;
    await read();
    inRead = false;
    await flush();
    return n;
  };

  it.each(reads(createI18n({ locale: "en" })).map((_, i) => [i]))("read #%i", async (i) => {
    expect(await during(i)).toBe(0);
  });

  it("the harness sees a t() that publishes (the gate is not blind)", async () => {
    let k = 0;
    // A t() that writes a catalog before reading — what R4-17 forbids.
    const publishing = (i18n: I18n) =>
      ({
        ...i18n,
        t: (key: string) => (i18n.add("en", { ["w" + k++]: "W" }), i18n.t(key)),
      }) as I18n;
    expect(await during(0, publishing)).toBe(1);
    expect(await during(4, publishing)).toBe(1);
  });
});

describe("view() — render-local catalogs (R4-15; 0.7 withMessages)", () => {
  const setup = () =>
    make({
      locale: "en",
      catalogs: { default: { en: { a: "cached-a", b: "cached-b" } }, shop: { en: { s: "S" } } },
    });

  it("reads the extra catalogs first, key by key over the published ones", () => {
    const { i18n } = setup();
    const v = view(i18n, state(i18n), { default: { en: { a: "view-a" } } });
    expect(translate(i18n, v, "a")).toBe("view-a");
    expect(translate(i18n, v, "b")).toBe("cached-b");
  });

  it("reads another locale and namespace from the extra catalogs, interpolating as usual", () => {
    const { i18n } = setup();
    const v = view(i18n, state(i18n), { greet: { de: { hi: "Hallo {n}" } } });
    expect(translate(i18n, v, "hi", { n: "Ann", locale: "de" }, "greet")).toBe("Hallo Ann");
  });

  it("publishes nothing, does not move rev, and leaves t() reading the published state", () => {
    const { i18n } = setup();
    const sub = vi.fn();
    i18n.on(sub);
    const s = state(i18n);
    const v = view(i18n, s, { default: { en: { a: "view-a" } } });
    expect(sub).not.toHaveBeenCalled();
    expect(v.rev).toBe(s.rev);
    expect(state(i18n)).toBe(s);
    expect(i18n.t("a")).toBe("cached-a");
  });

  it("is stable: the same state and catalog give back the same slots and compiled messages", () => {
    const { i18n } = setup();
    const extra = { default: { en: { a: "view {x}" } } };
    const v1 = view(i18n, state(i18n), extra);
    translate(i18n, v1, "a", { x: 1 });
    i18n.add("de", { z: "Z" }); // a publish elsewhere
    const v2 = view(i18n, state(i18n), extra);
    expect(v2.c.default.en).toBe(v1.c.default.en);
    expect(v2.c.shop).toBe(state(i18n).c.shop);
  });

  it("an empty extra returns the state itself; views do not see each other", () => {
    const { i18n } = setup();
    const s = state(i18n);
    expect(view(i18n, s, {})).toBe(s);
    const v1 = view(i18n, s, { default: { en: { a: "one" } } });
    const v2 = view(i18n, s, { default: { en: { a: "two" } } });
    expect([translate(i18n, v1, "a"), translate(i18n, v2, "a")]).toEqual(["one", "two"]);
  });

  it("a view made before a later add() still prefers its own catalog", () => {
    const { i18n } = setup();
    const v = view(i18n, state(i18n), { default: { en: { a: "view-a" } } });
    i18n.add("en", { a: "added" });
    expect(translate(i18n, v, "a")).toBe("view-a");
    expect(i18n.t("a")).toBe("added");
  });

  it("development: rejects an object that is not an instance (production trusts the types)", () => {
    expect(() => state({} as I18n)).toThrow(/not an instance/);
  });

  it("another locale: what its chain lacks counts as loading", () => {
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { a: "A" } },
      loader: () => new Promise(() => {}),
    });
    const v = view(i18n, state(i18n), {}, "de");
    // Loads at commit (setLocale), so the view reports it loading (the core's `isLoading`
    // rule, lot 4c: no flight is invented) and no key missing (no catalog of its chain).
    expect(v.ld).toEqual([]);
    expect(coming(i18n, v, "default")).toBe(true);
    expect(translate(i18n, v, "a")).toBe("a");
    expect(errors.map((e) => e.code)).toEqual([]);
    // Handed-over catalogs of the target are not loading; the published locale adds nothing.
    const de = view(i18n, state(i18n), { default: { de: { a: "DE" } } }, "de");
    expect(coming(i18n, de, "default")).toBe(false);
    expect(coming(i18n, view(i18n, state(i18n), { default: { en: { a: "V" } } }), "default")).toBe(
      false,
    );
    expect(state(i18n).ld).toEqual([]);
  });
});

describe("translate(…, join) — a binding's joiner (R4-20)", () => {
  it("every tag handler gets its children joined: per-call, defaultParams and nested", () => {
    const join = (parts: unknown[]) => ({ joined: parts });
    const seen: unknown[] = [];
    const H = { el: 1 };
    const h = (c: unknown) => (seen.push(c), H);
    const { i18n } = make({
      locale: "en",
      messages: { en: { a: "<x>one <y>two</y></x>", b: "<z/>" } },
      defaultParams: { y: h, z: h },
    });
    expect(translate(i18n, state(i18n), "a", { x: h }, undefined, join)).toEqual([H]);
    expect(seen).toEqual([{ joined: ["two"] }, { joined: ["one ", H] }]);
    seen.length = 0;
    translate(i18n, state(i18n), "b", undefined, undefined, join);
    expect(seen).toEqual([{ joined: [] }]);
    // Without a joiner (the instance's own t()), handlers get the parts array.
    seen.length = 0;
    i18n.t("a", { x: h });
    expect(seen).toEqual([["two"], ["one ", H]]);
  });
});

describe("acquire(i18n, ns) — a consumer's hold (lot 4c)", () => {
  it("loads like load(ns) but never asks a failed pair again (load() is the retry)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const release = acquire(i18n, "shop");
    await l.fail("en:shop");
    release();
    // A remount holding again: no refetch of the failed pair.
    acquire(i18n, "shop")();
    acquire(i18n, "shop");
    await i18n.ready;
    expect(l.requested).toEqual(["en:shop"]);
    // The explicit retry.
    const retry = i18n.load("shop");
    await l.answer("en:shop", { t: "Cart" });
    await retry;
    expect(l.requested).toEqual(["en:shop", "en:shop"]);
    expect(i18n.t("t", { ns: "shop" })).toBe("Cart");
  });

  it("keeps it active for later switches while held; does nothing after destroy()", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    acquire(i18n, "shop");
    await l.answer("en:shop", { t: "Cart" });
    const s = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:shop"]);
    await l.answer("de:shop", { t: "Korb" });
    await s;
    i18n.destroy();
    acquire(i18n, "other");
    await i18n.ready;
    expect(l.requested).toEqual(["en:shop", "de:shop"]);
  });
});

/**
 * R4-12 (S4): no module state holds request data. Two "requests" render in parallel with
 * an await between creating their instance and rendering, over SHARED catalog objects.
 * The harness itself is shown discriminating: the singleton variant (one module-level
 * instance switched per request) bleeds, the per-request variant does not.
 */
describe("SSR: no bleed between requests (R4-12)", () => {
  const catalogs = {
    default: {
      en: { hi: "Hello {name}" },
      de: { hi: "Hallo {name}" },
      uk: { hi: "Привіт {name}" },
    },
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const expected: Record<string, string> = { en: "Hello", de: "Hallo", uk: "Привіт" };

  const run = async (getI18n: (locale: string) => Promise<I18n>) => {
    let bleed = 0;
    const requests = Array.from({ length: 60 }, (_, i) => ["en", "de", "uk"][i % 3]);
    await Promise.all(
      requests.map(async (locale, i) => {
        const i18n = await getI18n(locale);
        await tick(); // e.g. an async page between the plugin and the render
        const out = i18n.t("hi", { name: `#${i}` }) as string;
        if (out !== `${expected[locale]} #${i}`) bleed++;
      }),
    );
    return bleed;
  };

  it("one instance per request: 0 bleed, catalogs shared by reference", async () => {
    const made: I18n[] = [];
    const bleed = await run(async (locale) => {
      const i18n = createI18n({ locale, catalogs });
      made.push(i18n);
      await i18n.ready;
      return i18n;
    });
    expect(bleed).toBe(0);
    expect(state(made[0]).c.default.en.m).toBe(catalogs.default.en);
    expect(state(made[3]).c.default.en.c).toBe(state(made[0]).c.default.en.c);
  });

  it("the harness sees a module-level singleton bleed (the gate is not blind)", async () => {
    const singleton = createI18n({ locale: "en", catalogs });
    const bleed = await run(async (locale) => {
      await singleton.setLocale(locale);
      return singleton;
    });
    expect(bleed).toBeGreaterThan(0);
  });
});
