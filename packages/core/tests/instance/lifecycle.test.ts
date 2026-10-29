/**
 * Construction, loading, plugins and destroy().
 * Ported by meaning from 0.7: lifecycle, initialization (sync constructor), destroy-order,
 * destroy-races, host-destroy-idempotence, init-single-flight (→ dedupe), init-failure-rollback
 * (→ transactional plugin setup), loader-inflight-loads, loader-reload-and-failure-reports,
 * static-loader, add-messages-supersedes-pending-load.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n, type Plugin } from "../../src/instance";
import { state } from "../../src/internal";
import { flush, make, manualLoader, tableLoader, trace } from "./helpers";

describe("createI18n()", () => {
  it("is synchronous: inline messages translate at once, with no init()", () => {
    const { i18n } = make({ locale: "en", messages: { en: { hi: "Hi {name}" } } });
    expect(i18n.t("hi", { name: "Ann" })).toBe("Hi Ann");
    expect("init" in i18n).toBe(false);
  });

  it("starts the loads of the locale chain × the active namespaces at once", () => {
    const { load, loaded } = tableLoader({});
    make({ locale: "de", fallbackLocale: "en", namespaces: ["default", "shop"], loader: load });
    expect(loaded().sort()).toEqual(["de:default", "de:shop", "en:default", "en:shop"]);
  });

  it("loads the default namespace when none is named, nothing with namespaces: []", () => {
    const a = tableLoader({});
    make({ locale: "en", loader: a.load });
    expect(a.loaded()).toEqual(["en:default"]);
    const b = tableLoader({});
    make({ locale: "en", namespaces: [], loader: b.load });
    expect(b.loaded()).toEqual([]);
  });

  it("`ready` settles when the loads in flight settle, failures included, and never rejects", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", loader: l.load });
    let settled = false;
    void i18n.ready.then(() => (settled = true));
    await flush();
    expect(settled).toBe(false);
    await l.fail("en:default");
    expect(settled).toBe(true);
    expect(errors.map((e) => e.code)).toContain("load_failed");
    await expect(i18n.ready).resolves.toBeUndefined();
  });

  it("keeps the catalog maps' own entries only", () => {
    const messages = Object.create({ inherited: { a: "x" } });
    messages.en = { a: "A" };
    const { i18n } = make({ locale: "en", messages });
    expect(Object.keys(state(i18n).c.default)).toEqual(["en"]);
  });
});

describe("loading", () => {
  it("concurrent requests for one pair share ONE load", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const all = Promise.all([i18n.load("shop"), i18n.load("shop"), i18n.load("shop")]);
    await l.answer("en:shop", { t: "Cart" });
    await all;
    expect(l.requested).toEqual(["en:shop"]);
    expect(i18n.t("t", { ns: "shop" })).toBe("Cart");
  });

  it("a pair in place is not loaded again", async () => {
    const { load } = tableLoader({ "en:shop": { t: "Cart" } });
    const { i18n } = make({ locale: "en", namespaces: [], loader: load });
    await i18n.load("shop");
    await i18n.load("shop");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("load(ns) asks a failed pair again (explicit retry)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", namespaces: [], loader: l.load });
    const first = i18n.load("shop");
    await l.fail("en:shop");
    await expect(first).rejects.toThrow("404 en:shop");
    const second = i18n.load("shop");
    await l.answer("en:shop", { t: "Cart" });
    await second;
    expect(l.requested).toEqual(["en:shop", "en:shop"]);
    expect(i18n.t("t", { ns: "shop" })).toBe("Cart");
  });

  it("a loader that throws synchronously reports load_failed and parks nothing", async () => {
    let calls = 0;
    const { i18n, errors } = make({
      locale: "en",
      namespaces: [],
      loader: () => {
        calls++;
        throw new Error("sync");
      },
    });
    await expect(i18n.load("shop")).rejects.toThrow("sync");
    expect(errors).toEqual([
      expect.objectContaining({ code: "load_failed", locale: "en", ns: "shop" }),
    ]);
    expect(state(i18n).ld).toEqual([]);
    await expect(i18n.load("shop")).rejects.toThrow("sync");
    expect(calls).toBe(2);
  });

  it.each([null, "a string", 42])(
    "a loader result that is not a catalog (%j) is a load failure",
    async (v) => {
      const { i18n, errors } = make({
        locale: "en",
        namespaces: [],
        loader: async () => v as never,
      });
      await expect(i18n.load("shop")).rejects.toThrow();
      expect(errors.map((e) => e.code)).toEqual(["load_failed"]);
      expect(state(i18n).ld).toEqual([]);
    },
  );

  it("a static import map works as a loader, `{ default }` modules unwrapped by the app", async () => {
    const map: Record<string, () => Promise<{ default: Record<string, string> }>> = {
      "en:default": async () => ({ default: { a: "A" } }),
    };
    const { i18n } = make({
      locale: "en",
      loader: async (l, n) => (await map[`${l}:${n}`]()).default,
    });
    await i18n.ready;
    expect(i18n.t("a")).toBe("A");
  });

  it("a load's start and end are published, and a key of a loading catalog reports no missing_key", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", loader: l.load });
    expect(state(i18n).ld).toEqual(["en\0default"]);
    expect(i18n.t("a")).toBe("a");
    expect(errors).toEqual([]);
    await l.answer("en:default", { a: "A" });
    expect(state(i18n).ld).toEqual([]);
    expect(i18n.t("a")).toBe("A");
  });

  it("add() during a pending load does not cancel it; the added messages stay on top when it lands (R3-14 H8)", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", loader: l.load });
    const seen = trace(i18n);
    i18n.add("en", { a: "manual" });
    // Shown at once, the load still in flight.
    expect(seen).toHaveLength(1);
    expect(i18n.t("a")).toBe("manual");
    expect(l.signals.get("en:default")!.aborted).toBe(false);
    expect(state(i18n).ld).toEqual(["en\0default"]);
    await l.answer("en:default", { a: "loaded", b: "B" });
    // The load's other keys arrive; the saved edit is not lost under the delivery.
    expect(i18n.t("a")).toBe("manual");
    expect(i18n.t("b")).toBe("B");
    expect(state(i18n).ld).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("add() twice during a pending load: both batches survive the delivery, the later wins", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    i18n.add("en", { a: "one", b: "one" });
    i18n.add("en", { b: "two" });
    await l.answer("en:default", { a: "loaded", b: "loaded", c: "C" });
    expect([i18n.t("a"), i18n.t("b"), i18n.t("c")]).toEqual(["one", "two", "C"]);
  });

  it("a load landing under add()ed messages flattens into a base: no patch, the fast path is back (H8)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    i18n.add("en", { a: "manual" });
    i18n.add("en", { b: "patched" });
    await l.answer("en:default", { a: "loaded", b: "loaded", c: "C" });
    const slot = state(i18n).c.default.en;
    expect(slot.p).toBeUndefined();
    expect(slot.pc).toBeUndefined();
    expect({ ...slot.m }).toEqual({ a: "manual", b: "patched", c: "C" });
    expect(state(i18n).pr).toBeDefined();
    expect([i18n.t("a"), i18n.t("b"), i18n.t("c")]).toEqual(["manual", "patched", "C"]);
    // Served by the primary record: every key compiled into `pr` by now.
    expect(state(i18n).pr!.c).toBe("C");
  });

  it("a load landing under add()ed messages keeps their compiled messages (H3)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    i18n.add("en", { a: "Hi {n}" });
    i18n.add("en", { b: "Bye {n}" });
    expect(i18n.t("a", { n: 1 })).toBe("Hi 1");
    expect(i18n.t("b", { n: 1 })).toBe("Bye 1");
    const before = state(i18n).c.default.en;
    const fa = before.c.a;
    const fb = before.pc!.b;
    expect(typeof fa).toBe("function");
    expect(typeof fb).toBe("function");
    await l.answer("en:default", { a: "loaded", c: "C" });
    const after = state(i18n).c.default.en;
    expect(after.c.a).toBe(fa);
    expect(after.c.b).toBe(fb);
  });

  it("a load landing into an empty pair keeps its catalog by reference (R4-12), not a copy", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    const cat = { a: "A" };
    await l.answer("en:default", cat);
    expect(state(i18n).c.default.en.m).toBe(cat);
  });

  it("add() for another namespace leaves a pending load alone", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    i18n.add("en", { s: "S" }, "shop");
    expect(l.signals.get("en:default")!.aborted).toBe(false);
    await l.answer("en:default", { a: "A" });
    expect(i18n.t("a")).toBe("A");
  });

  it("the loader receives the locale as the app spells it, never the canonical form", async () => {
    const { load, loaded } = tableLoader({});
    make({ locale: "iw", loader: load });
    make({ locale: "pt_BR", loader: load });
    expect(loaded()).toEqual(["iw:default", "pt_BR:default", "pt:default"]);
  });
});

describe("plugins", () => {
  const plugin = (name: string, log: string[], down = true): Plugin => ({
    name,
    setup: () => {
      log.push(`setup ${name}`);
      return down ? () => log.push(`down ${name}`) : undefined;
    },
  });

  it("are set up in order and torn down last-first by destroy()", () => {
    const log: string[] = [];
    const i18n = createI18n({
      locale: "en",
      plugins: [plugin("a", log), plugin("b", log, false), plugin("c", log)],
    });
    i18n.destroy();
    expect(log).toEqual(["setup a", "setup b", "setup c", "down c", "down a"]);
  });

  it("setup is transactional: a throwing plugin tears down what came before, then throws", () => {
    const log: string[] = [];
    const boom: Plugin = {
      name: "boom",
      setup: () => {
        throw new Error("required plugin failed");
      },
    };
    expect(() =>
      createI18n({ locale: "en", plugins: [plugin("a", log), boom, plugin("c", log)] }),
    ).toThrow("required plugin failed");
    expect(log).toEqual(["setup a", "down a"]);
  });

  it("a plugin that switches the locale in setup loads that locale only", async () => {
    const { load, loaded } = tableLoader({ "de:default": { a: "A-de" } });
    const i18n = createI18n({
      locale: "en",
      loader: load,
      plugins: [{ name: "pick", setup: (i) => void i.setLocale("de") }],
    });
    await i18n.ready;
    expect(loaded()).toEqual(["de:default"]);
    expect(i18n.locale).toBe("de");
  });
});

describe("destroy()", () => {
  it("aborts every load, drops subscribers, runs teardowns, and is idempotent", async () => {
    const l = manualLoader();
    const down = vi.fn();
    const i18n = createI18n({
      locale: "en",
      loader: l.load,
      plugins: [{ name: "p", setup: () => down }],
    });
    const sub = vi.fn();
    i18n.on(sub);
    i18n.destroy();
    i18n.destroy();
    expect(down).toHaveBeenCalledTimes(1);
    expect(l.signals.get("en:default")!.aborted).toBe(true);
    await l.answer("en:default", { a: "late" });
    expect(sub).not.toHaveBeenCalled();
    expect(state(i18n).c.default).toBeUndefined();
  });

  it("a listener added after destroy() never fires and writes are ignored", async () => {
    const { i18n } = make({ locale: "en", messages: { en: { a: "A" } } });
    i18n.destroy();
    const sub = vi.fn();
    i18n.on(sub);
    i18n.add("en", { a: "B" });
    i18n.setDefaultParams({ x: 1 });
    await i18n.load("x");
    expect(sub).not.toHaveBeenCalled();
    expect(i18n.t("a")).toBe("A");
  });

  it("runs every teardown even when one throws, and rethrows it outside the loop", async () => {
    vi.useFakeTimers();
    try {
      const log: string[] = [];
      const i18n = createI18n({
        locale: "en",
        plugins: [
          { name: "a", setup: () => () => log.push("a") },
          {
            name: "b",
            setup: () => () => {
              throw new Error("teardown b");
            },
          },
        ],
      });
      i18n.destroy();
      expect(log).toEqual(["a"]);
      expect(() => vi.runAllTimers()).toThrow("teardown b");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("subscribers", () => {
  it("a throwing subscriber does not stop the others; its error is rethrown outside the publish", () => {
    vi.useFakeTimers();
    try {
      const { i18n } = make({ locale: "en" });
      const second = vi.fn();
      i18n.on(() => {
        throw new Error("listener");
      });
      i18n.on(second);
      i18n.add("en", { a: "A" });
      expect(second).toHaveBeenCalledTimes(1);
      expect(() => vi.runAllTimers()).toThrow("listener");
    } finally {
      vi.useRealTimers();
    }
  });

  it("unsubscribe stops delivery", () => {
    const { i18n } = make({ locale: "en" });
    const sub = vi.fn();
    const off = i18n.on(sub);
    i18n.add("en", { a: "A" });
    off();
    i18n.add("en", { b: "B" });
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
