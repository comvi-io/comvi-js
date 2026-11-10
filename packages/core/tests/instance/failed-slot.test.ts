/**
 * A server payload's failed (`null`) slot handed over after creation (lot 6a, owner decision
 * after the review): `view()` renders without the slot, `Core.f` gives the instance the same
 * meaning `createI18n({ catalogs })` gives a `null` slot.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/instance";
import { core, state, translate, view } from "../../src/internal";

const setup = () => {
  const loader = vi.fn(async (l: string, _ns: string) => ({ t: `loaded ${l}` }));
  const i18n = createI18n({
    locale: "uk",
    fallbackLocale: "en",
    loader,
    catalogs: { default: { uk: { t: "Привіт" }, en: { t: "Hello" } } },
  });
  return { i18n, loader };
};

describe("a failed slot after creation", () => {
  it("view() renders the fallback without the slot and publishes nothing", () => {
    const { i18n } = setup();
    const s = state(i18n);
    const v = view(i18n, s, { default: { uk: null } });
    expect(translate(i18n, v, "t")).toBe("Hello");
    expect(state(i18n)).toBe(s);
    expect(i18n.t("t")).toBe("Привіт");
    // A null for a slot nobody has keeps every slot and publishes nothing; the render-local
    // state reads the pair as failed, as the server did (`isLoading` false, no load predicted;
    // hydration with a null slot, owner decision 2026-11-10).
    const w = view(i18n, s, { admin: { uk: null, en: null } });
    expect(w.c).toBe(s.c);
    expect(state(i18n)).toBe(s);
    expect(core(i18n).w(s, "admin")).toBe(true);
    expect(core(i18n).w(w, "admin")).toBe(false);
    // Only the pairs the payload failed: the fallback's load is still predicted.
    expect(core(i18n).w(view(i18n, s, { admin: { uk: null } }), "admin")).toBe(true);
  });

  it("Core.f takes the catalog out, fails the pair, and only an explicit retry asks for it", async () => {
    const { i18n, loader } = setup();
    await i18n.ready;
    const rev = i18n.rev();
    core(i18n).f("uk", "default");
    expect(i18n.rev()).toBe(rev + 1);
    expect(i18n.t("t")).toBe("Hello");
    // A consumer's hold does not ask for a failed pair.
    core(i18n).h("default");
    await i18n.ready;
    expect(loader).not.toHaveBeenCalled();
    // The same failure again publishes nothing.
    core(i18n).f("uk", "default");
    expect(i18n.rev()).toBe(rev + 1);
    await i18n.load("default");
    expect(loader.mock.calls.map((c) => c[0])).toEqual(["uk"]);
    expect(i18n.t("t")).toBe("loaded uk");
  });

  it("a namespace first seen failed is needed (handed over as null) and not asked for", async () => {
    const { i18n, loader } = setup();
    core(i18n).f("uk", "admin");
    core(i18n).h("admin");
    await i18n.ready;
    expect(loader.mock.calls.filter((c) => c[1] === "admin").map((c) => c[0])).toEqual(["en"]);
    expect(core(i18n).b.has("uk\0admin")).toBe(true);
  });
});

describe("re-review of lot 6a (2026-11-10)", () => {
  it("a load(ns) whose flight a payload's null aborts rejects with an Error (item 3)", async () => {
    let answer!: (c: Record<string, string>) => void;
    const i18n = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      catalogs: { default: { uk: {}, en: {} } },
      loader: (l, n) =>
        l === "uk" && n === "admin"
          ? new Promise((y) => (answer = y))
          : Promise.resolve({ title: "Admin" }),
      onError: () => {},
    });
    const waiting = i18n.load("admin");
    await Promise.resolve();
    core(i18n).f("uk", "admin");
    answer({ title: "late" });
    const e = await waiting.then(
      () => "resolved",
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(Error);
    expect(i18n.t("title", { ns: "admin" })).toBe("Admin");
  });

  it("a load(ns) whose pair the server then hands as a catalog (or {}) resolves: loaded by the server (F2)", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ title: "Server" }, "Server"],
      [{}, "title"],
    ];
    for (const [given, shown] of cases) {
      let answer!: (c: Record<string, string>) => void;
      const i18n = createI18n({
        locale: "uk",
        catalogs: { default: { uk: {} } },
        loader: () => new Promise((y) => (answer = y)),
        onError: () => {},
      });
      const waiting = i18n.load("admin");
      await Promise.resolve();
      core(i18n).f("uk", "admin", given);
      answer({ title: "late" });
      await expect(waiting).resolves.toBeUndefined();
      expect(i18n.t("title", { ns: "admin" })).toBe(shown);
      expect(core(i18n).w(core(i18n).s(), "admin")).toBeFalsy();
    }
  });

  it("view() reports a nested catalog's collision and invalid leaf, once per catalog object (item 4)", () => {
    const errors: { code: string; key?: string }[] = [];
    const i18n = createI18n({ locale: "en", onError: (e) => errors.push(e) });
    const m = { a: { b: "first" }, "a.b": "second", invalid: 42 } as never;
    const v = view(i18n, state(i18n), { default: { en: m } });
    expect(translate(i18n, v, "a.b")).toBe("first");
    view(i18n, state(i18n), { default: { en: m } });
    const syntax = () => errors.filter((e) => e.code === "syntax").map((e) => e.key);
    // A server render commits nothing: the render-local entry reports.
    expect(syntax()).toEqual(["a.b", "invalid"]);
    // The commit of the same catalog object reports nothing again.
    i18n.add("en", m);
    expect(syntax()).toEqual(["a.b", "invalid"]);
  });
});
