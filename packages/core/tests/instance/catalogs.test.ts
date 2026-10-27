/**
 * Catalog ingestion, the layered add() (R4-1b), the primary-record fast path (R4-1d) and
 * "references, not copies" (R4-12).
 * Ported by meaning from 0.7: catalog-ingestion-isolation, host-catalog-inherited-keys,
 * catalog-null-prototype-nesting, catalog-flatten-warnings (→ development `syntax` on a
 * nested catalog), host-catalog-ingestion-guards, add-messages-emit,
 * hot-path-invariants (instance half), translate-static-detection (instance half).
 * New in 1b: S1 cow-identity (counted), stale-prim on every slot-replacing path.
 */
import { describe, expect, it, vi } from "vitest";
import { recordFor } from "../../src/compile/cache";
import { createI18n } from "../../src/instance";
import { state, view } from "../../src/internal";
import { FLAT } from "../../src/state";
import { make, manualLoader } from "./helpers";

describe("ingestion", () => {
  it("keeps a flat caller catalog BY REFERENCE and never changes it", () => {
    const en = { a: "A", b: "Hi {x}" };
    const frozen = Object.freeze({ c: "C" });
    const { i18n } = make({ locale: "en", messages: { en, de: frozen } });
    expect(state(i18n).c.default.en.m).toBe(en);
    expect(state(i18n).c.default.de.m).toBe(frozen);
    i18n.t("b", { x: 1 });
    expect(en).toEqual({ a: "A", b: "Hi {x}" });
    expect(Object.keys(en)).toEqual(["a", "b"]);
  });

  it("two instances over one catalog object share its compiled record", () => {
    const en = { b: "Hi {x}" };
    const a = createI18n({ locale: "en", messages: { en } });
    const b = createI18n({ locale: "en", messages: { en } });
    a.t("b", { x: 1 });
    expect(state(b).c.default.en.c).toBe(state(a).c.default.en.c);
    expect(typeof recordFor(en).b).toBe("function");
  });

  it("never resolves a key inherited from Object.prototype, and resolves an own one of that name", () => {
    const { i18n } = make({ locale: "en", messages: { en: { toString: "own" } } });
    expect(i18n.t("toString")).toBe("own");
    expect(i18n.t("hasOwnProperty")).toBe("hasOwnProperty");
    const proto = Object.create({ inherited: "x" });
    proto.own = "y";
    const { i18n: j } = make({ locale: "en", messages: { en: proto } });
    expect(j.t("inherited")).toBe("inherited");
    expect(j.t("own")).toBe("y");
  });

  it("reads a null-prototype catalog as is", () => {
    const en = Object.assign(Object.create(null), { a: "A" });
    const { i18n } = make({ locale: "en", messages: { en } });
    expect(i18n.t("a")).toBe("A");
    expect(state(i18n).c.default.en.m).toBe(en);
  });

  it("development: a nested (non-flat) value reports `syntax` and is not a message", () => {
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { nav: { home: "Home" }, n: 5, ok: "OK" } as never },
    });
    expect(errors.map((e) => [e.code, e.key])).toEqual([
      ["syntax", "nav"],
      ["syntax", "n"],
    ]);
    expect(errors[0].message).toMatch(/flat/);
    expect(i18n.t("nav")).toBe("nav");
    expect(i18n.t("ok")).toBe("OK");
  });

  it("add() publishes once and makes the key readable at once; add({}) does not throw", () => {
    const { i18n } = make({ locale: "en" });
    const sub = vi.fn();
    i18n.on(sub);
    i18n.add("en", { a: "A" });
    expect(i18n.t("a")).toBe("A");
    i18n.add("en", {});
    expect(sub).toHaveBeenCalledTimes(2);
  });

  it("add() under an invalid locale reports invalid_locale and adds nothing", () => {
    const { i18n, errors } = make({ locale: "en" });
    i18n.add("!!", { a: "A" });
    expect(errors).toEqual([expect.objectContaining({ code: "invalid_locale", locale: "!!" })]);
    expect(state(i18n).c.default).toBeUndefined();
  });
});

describe("layered add() (R4-1b): O(patch), never O(catalog) — counted, no clock", () => {
  const big = () => {
    const en: Record<string, string> = {};
    for (let i = 0; i < 10_000; i++) en[`k${i}`] = i % 2 ? `Hi {name} #${i}` : `Static ${i}`;
    return en;
  };

  it("adding one key to a fully compiled 10K catalog keeps the base and all 10,000 compiled messages", () => {
    const en = big();
    const { i18n } = make({ locale: "en", messages: { en } });
    for (let i = 0; i < 10_000; i++) i18n.t(`k${i}`, { name: "x" });
    const before = state(i18n).c.default.en;
    const compiled = { ...before.c };
    expect(Object.keys(compiled)).toHaveLength(10_000);

    i18n.add("en", { k1: "Changed {name}" });

    const after = state(i18n).c.default.en;
    expect(after.m).toBe(en); // the base catalog: same object
    expect(after.c).toBe(before.c); // its compiled record: same object
    expect(Object.keys(after.p!)).toEqual(["k1"]); // the patch holds the one key
    let kept = 0;
    for (const k in compiled) if (after.c[k] === compiled[k]) kept++;
    expect(kept).toBe(10_000);
    expect(i18n.t("k1", { name: "x" })).toBe("Changed x");
    expect(i18n.t("k3", { name: "x" })).toBe("Hi x #3");
    expect(Object.keys(after.pc!)).toEqual(["k1"]); // one compile for the patch
  });

  it("a patch past FLAT keys is flattened into a new base that inherits the untouched compiled messages", () => {
    const en = big();
    const { i18n } = make({ locale: "en", messages: { en } });
    for (let i = 0; i < 10_000; i++) i18n.t(`k${i}`, { name: "x" });
    const old = state(i18n).c.default.en.c;
    const patch: Record<string, string> = {};
    for (let i = 0; i <= FLAT; i++) patch[`k${i}`] = `New ${i}`;
    i18n.add("en", patch);
    const slot = state(i18n).c.default.en;
    expect(slot.p).toBeUndefined();
    expect(slot.m).not.toBe(en);
    let inherited = 0;
    for (const k in slot.c) if (slot.c[k] === old[k]) inherited++;
    expect(inherited).toBe(10_000 - (FLAT + 1));
    expect(i18n.t("k0")).toBe("New 0");
    expect(i18n.t("k9999", { name: "y" })).toBe("Hi y #9999");
    expect(en.k0).toBe("Static 0");
  });

  it("successive patches keep each other's compiled messages", () => {
    const { i18n } = make({ locale: "en", messages: { en: { a: "A" } } });
    i18n.add("en", { b: "B {x}" });
    i18n.t("b", { x: 1 });
    const pc = state(i18n).c.default.en.pc!;
    i18n.add("en", { c: "C" });
    expect(state(i18n).c.default.en.pc!.b).toBe(pc.b);
    expect([i18n.t("a"), i18n.t("b", { x: 2 }), i18n.t("c")]).toEqual(["A", "B 2", "C"]);
  });
});

/**
 * R4-1d: `t(key)` without params returns the cached primary record's string. Every path
 * that replaces the slot behind it must leave no stale record: each case renders a static
 * key through the fast path, replaces the slot, and renders it again.
 */
describe("the primary record is never stale (R4-1d)", () => {
  const warm = (i18n: ReturnType<typeof createI18n>) => expect(i18n.t("k")).toBe("old");

  it("add() into an empty pair at the current locale", () => {
    const { i18n } = make({ locale: "en", messages: { de: { k: "old" } } });
    expect(i18n.t("k")).toBe("k");
    i18n.add("en", { k: "new" });
    expect(i18n.t("k")).toBe("new");
  });

  it("add() as a patch over the current slot", () => {
    const { i18n } = make({ locale: "en", messages: { en: { k: "old" } } });
    warm(i18n);
    i18n.add("en", { k: "new" });
    expect(i18n.t("k")).toBe("new");
  });

  it("add() that flattens the patch", () => {
    const { i18n } = make({ locale: "en", messages: { en: { k: "old" } } });
    warm(i18n);
    const patch: Record<string, string> = { k: "new" };
    for (let i = 0; i < FLAT; i++) patch[`p${i}`] = "x";
    i18n.add("en", patch);
    expect(state(i18n).c.default.en.p).toBeUndefined();
    expect(i18n.t("k")).toBe("new");
  });

  it("a loader attaching the catalog", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    expect(i18n.t("k")).toBe("k");
    await l.answer("en:default", { k: "new" });
    expect(i18n.t("k")).toBe("new");
  });

  it("setLocale()", async () => {
    const { i18n } = make({ locale: "en", messages: { en: { k: "old" }, de: { k: "new" } } });
    warm(i18n);
    await i18n.setLocale("de");
    expect(i18n.t("k")).toBe("new");
  });

  it("view(): a render-local state has its own primary record", () => {
    const { i18n } = make({ locale: "en", messages: { en: { k: "old" } } });
    warm(i18n);
    const v = view(i18n, state(i18n), { default: { en: { k: "new" } } });
    expect(v.pr).not.toBe(state(i18n).pr);
    expect(v.pr && v.pr.k).not.toBe("old");
    expect(i18n.t("k")).toBe("old");
  });

  it("add() to another namespace or locale leaves the primary record alone", () => {
    const { i18n } = make({ locale: "en", messages: { en: { k: "old" } } });
    warm(i18n);
    const pr = state(i18n).pr;
    i18n.add("en", { k: "shop" }, "shop");
    i18n.add("de", { k: "de" });
    expect(state(i18n).pr).toBe(pr);
    expect(i18n.t("k")).toBe("old");
  });
});
