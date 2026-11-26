/**
 * Claims the mutation run of lot 1d found unmade: the bounded chain memo, the abort of
 * superseded loads, what destroy() releases, the exact rejection of a failed switch, and
 * view()'s slot memo and loading entries (design §2.5, R4-11, R4-15).
 */
import { describe, expect, it, vi } from "vitest";
import { CORE, MS, createI18n } from "../../src/instance";
import { clock, coming, core, handover, state, translate, view } from "../../src/internal";
import { flush, make, manualLoader } from "./helpers";

declare const __VERSION__: string;

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
  it("one extra catalog object for two different slots: each slot becomes it (model A)", () => {
    const { i18n } = make({ locale: "en", messages: { en: { a: "A1", b: "B1" } } });
    const extra = { a: "view" };
    // A view onto a pair with no slot yet, the same catalog object first.
    expect(
      translate(i18n, view(i18n, state(i18n), { shop: { en: extra } }), "a", { ns: "shop" }),
    ).toBe("view");
    const v1 = view(i18n, state(i18n), { default: { en: extra } });
    expect([translate(i18n, v1, "a"), translate(i18n, v1, "b")]).toEqual(["view", "b"]);
    i18n.add("en", { b: "B2" });
    const v2 = view(i18n, state(i18n), { default: { en: extra } });
    expect([translate(i18n, v2, "a"), translate(i18n, v2, "b")]).toEqual(["view", "b"]);
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

  it("in another locale, a namespace with no catalog of that chain is loading by the core's rule (lot 4c)", () => {
    const { i18n } = make({
      locale: "en",
      namespaces: ["default", "shop"],
      messages: { en: { a: "A" } },
      loader: () => new Promise(() => {}),
    });
    const v = view(i18n, { ...state(i18n), ld: [] }, {}, "de");
    // No flight is invented: the view keeps the state's.
    expect(v.ld).toEqual([]);
    // `isFetching`: what the switch at commit loads (the chain of de lacks it, nothing failed).
    expect(coming(i18n, v, "shop")).toBe(true);
    expect(coming(i18n, v, "default")).toBe(true);
    expect(coming(i18n, { ...state(i18n), ld: [] }, "default")).toBe(false);
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

describe("an instance of another copy of the core (B3)", () => {
  // What another copy's createI18n() leaves on its instance: the registry symbol and that
  // copy's version. This copy's CORE has never seen it.
  const foreign = (version: string) =>
    ({ [Symbol.for("comvi")]: version }) as unknown as ReturnType<typeof createI18n>;
  const twoCopies = (made: string) =>
    `[@comvi/core] two copies of @comvi/core are loaded: the instance was created by @comvi/core@${made}, and a second copy, @comvi/core@${__VERSION__}, reads it. Put @comvi/core and every binding on one version and install it once.`;
  const sameVersion = `[@comvi/core] this instance was not created by this copy of @comvi/core, though both are @comvi/core@${__VERSION__}: one version is installed twice (install it once), or the instance is a copy or a Proxy of the real one (pass the instance itself; in Vue, toRaw() it), or the development and production builds of one install meet.`;
  const untagged =
    "[@comvi/core] not an instance of createI18n(), or it was created by a copy of @comvi/core older than 0.8";

  it("core() of an instance at another version → an error naming both copies and versions", () => {
    const i18n = foreign("0.0.0-other");

    const read = () => core(i18n);

    expect(read).toThrow(new Error(twoCopies("0.0.0-other")));
  });

  it("core() of an instance at the same version → names a second install, a copy or Proxy, and the two builds", () => {
    const i18n = foreign(__VERSION__);

    const read = () => core(i18n);

    expect(read).toThrow(new Error(sameVersion));
  });

  it.each([
    ["a spread", (i: ReturnType<typeof createI18n>) => ({ ...i })],
    ["a Proxy", (i: ReturnType<typeof createI18n>) => new Proxy(i, {})],
  ])("core() of %s of a real instance → the same-version text", (_, wrap) => {
    const i18n = wrap(createI18n({ locale: "en" }));

    const read = () => core(i18n);

    expect(read).toThrow(new Error(sameVersion));
  });

  it("clock() (a binding's useFormat) of an instance at another version → the same error as core()", () => {
    const i18n = foreign("0.0.0-other");

    const read = () => clock(i18n);

    expect(read).toThrow(new Error(twoCopies("0.0.0-other")));
  });

  it("handover() of an instance at another version → the same error as core()", () => {
    const i18n = foreign("0.0.0-other");

    const hand = () => handover(i18n);

    expect(hand).toThrow(new Error(twoCopies("0.0.0-other")));
  });

  it.each([
    // A 0.7.x core leaves no tag: its instance has the members and nothing else to read.
    ["an untagged 0.7-style instance", { locale: "en", t: () => "", on: () => () => {} }],
    ["a plain object", {}],
  ])("core() of %s → not an instance, or one of a core older than 0.8", (_, value) => {
    const read = () => core(value as unknown as ReturnType<typeof createI18n>);

    expect(read).toThrow(new TypeError(untagged));
  });
});
