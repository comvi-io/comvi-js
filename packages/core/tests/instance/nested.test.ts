/**
 * Nested catalogs (lot 6a, owner decision D1 of 2026-11-10): one rule (src/flat.ts) at every
 * entry — `messages`, `catalogs`, `add()`, a loader's result, a binding's handover (`view()`).
 * Inside, catalogs stay flat; `t()` walks nothing. The rule's cases live in
 * tests/fixtures/nested/cases.json, which @comvi/typegen and @comvi/cli test against too.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flat } from "../../src/flat";
import { createI18n } from "../../src/instance";
import { state, translate, view } from "../../src/internal";
import { handover } from "../../src/ssr";
import type { I18nError } from "../../src/errors";

type Case = { name: string; input: object; flat: Record<string, string>; left: [string, number][] };
// Read with JSON.parse: a `__proto__` key stays an own key (an object literal would set the prototype).
const { cases } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../fixtures/nested/cases.json"), "utf8"),
) as { cases: Case[] };
const own = (o: object) => Object.fromEntries(Object.entries(o));
const deep = (o: unknown): unknown => JSON.parse(JSON.stringify(o));

describe("flat(): the rule", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const before = deep(c.input);
    const left: [string, number][] = [];
    const out = flat(c.input as never, (k, x) => left.push([k, x]));
    expect(own(out)).toEqual(c.flat);
    expect(left).toEqual(c.left);
    // The input is never changed; no prototype is.
    expect(deep(c.input)).toEqual(before);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    if (out !== c.input) expect(Object.getPrototypeOf(out)).toBe(null);
  });

  it("a catalog of strings is returned as is: no copy", () => {
    const en = { a: "A", "b.c": "B" };
    expect(flat(en)).toBe(en);
  });
});

const NESTED = {
  account: {
    greeting: "Привіт, {name}!",
    items: "{count, plural, one {# товар} few {# товари} other {# товарів}}",
  },
  terms: { read: "Прочитайте <link>умови</link>." },
};
const FLAT = own(flat(NESTED));
const EN = { account: { only_en: "Only in English" } };

const reads = (i18n: ReturnType<typeof createI18n>) => [
  i18n.t("account.greeting", { name: "Олена" }),
  i18n.t("account.items", { count: 3 }),
  i18n.t("terms.read", { link: (c: unknown) => `[${c}]` }),
  i18n.t("account.only_en"),
];
const EXPECTED = ["Привіт, Олена!", "3 товари", "Прочитайте [умови].", "Only in English"];

describe("a nested catalog reads like its flat form through every entry", () => {
  it("messages", () => {
    for (const uk of [NESTED, FLAT]) {
      const i18n = createI18n({ locale: "uk", fallbackLocale: "en", messages: { uk, en: EN } });
      expect(reads(i18n)).toEqual(EXPECTED);
    }
  });

  it("catalogs, add() and handover()", () => {
    const i18n = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      catalogs: { default: { uk: NESTED, en: EN } },
    });
    expect(reads(i18n)).toEqual(EXPECTED);
    i18n.add("uk", { account: { greeting: "Вітаю, {name}!" } });
    expect(i18n.t("account.greeting", { name: "Олена" })).toBe("Вітаю, Олена!");
    // The payload is flat: a browser instance needs no rule of its own.
    const p = handover(i18n);
    expect(own(p.catalogs.default.uk!)).toEqual({ ...FLAT, "account.greeting": "Вітаю, {name}!" });
    expect(reads(createI18n({ fallbackLocale: "en", ...p }))[1]).toBe("3 товари");
  });

  it("a loader's result", async () => {
    const i18n = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      loader: async (l) => (l === "uk" ? NESTED : EN),
    });
    await i18n.ready;
    expect(reads(i18n)).toEqual(EXPECTED);
  });

  it("a binding's handover (view()): the render and the commit read the same keys", () => {
    const i18n = createI18n({ locale: "uk", fallbackLocale: "en", messages: { en: EN } });
    const v = view(i18n, state(i18n), { default: { uk: NESTED } });
    expect(translate(i18n, v, "account.greeting", { name: "Олена" })).toBe("Привіт, Олена!");
    // The same catalog object gives the same flattened catalog and compiled record on the next render.
    const w = view(i18n, state(i18n), { default: { uk: NESTED } }).c.default.uk;
    expect(w.m).toBe(v.c.default.uk.m);
    expect(w.c).toBe(v.c.default.uk.c);
  });
});

describe("diagnostics", () => {
  it("a collision keeps the first leaf and reports `syntax`; an invalid leaf is left out and reported", () => {
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: { a: { b: "nested" }, "a.b": "flat", n: 5 } as never },
      onError: (e) => errors.push(e),
    });
    expect(i18n.t("a.b")).toBe("nested");
    expect(i18n.t("n")).toBe("n");
    expect(
      errors.filter((e) => e.code === "syntax").map((e) => [e.code, e.key, e.locale, e.ns]),
    ).toEqual([
      ["syntax", "a.b", "en", "default"],
      ["syntax", "n", "en", "default"],
    ]);
    expect(errors.find((e) => e.key === "a.b")!.message).toMatch(
      /both as a flat key and through nesting/,
    );
  });

  it("`__proto__` and `constructor` as group or leaf names are keys; no prototype changes", () => {
    const en = JSON.parse('{"__proto__": {"x": "P"}, "constructor": "C", "toString": {"y": "T"}}');
    const i18n = createI18n({ locale: "en", messages: { en } });
    expect([i18n.t("__proto__.x"), i18n.t("constructor"), i18n.t("toString.y")]).toEqual([
      "P",
      "C",
      "T",
    ]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("x");
  });
});
