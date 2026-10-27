/**
 * plural / selectordinal / select beyond the golden table.
 * Ported by meaning from: pluralization, select, icu-select-branch-rendering,
 * icu-exact-plural-selectors, icu-invalid-plural-param, icu-argument-shapes,
 * icu-nested-comma, empty-translation-fallback (branch half).
 */
import { describe, expect, it } from "vitest";
import { fmt, sink } from "../helpers";

describe("plural", () => {
  it("selects the CLDR category of the locale", () => {
    const t = "{n, plural, one {# день} few {# дні} many {# днів} other {# дня}}";
    expect([1, 2, 5, 21, 22, 25, 1.5].map((n) => fmt(t, { n }, "uk"))).toEqual([
      "1 день",
      "2 дні",
      "5 днів",
      "21 день",
      "22 дні",
      "25 днів",
      "1,5 дня",
    ]);
  });

  it("matches an exact selector before the category, and compares numbers (=1.0, =01, =-0)", () => {
    expect(fmt("{n, plural, =1.0 {exact} one {one} other {#}}", { n: 1 })).toBe("exact");
    expect(fmt("{n, plural, =01 {exact} other {#}}", { n: 1 })).toBe("exact");
    expect(fmt("{n, plural, =-0 {zero} other {#}}", { n: 0 })).toBe("zero");
    expect(fmt("{n, plural, =0 {zero} other {#}}", { n: -0 })).toBe("zero");
    expect(fmt("{n, plural, =2.5 {two and a half} other {#}}", { n: 2.5 })).toBe("two and a half");
  });

  it("honours exact selectors on selectordinal", () => {
    expect(fmt("{n, selectordinal, =1 {first} one {#st} other {#th}}", { n: 1 })).toBe("first");
    expect(fmt("{n, selectordinal, =1 {first} one {#st} other {#th}}", { n: 21 })).toBe("21st");
  });

  it("applies offset to the category and to #, but not to exact selectors", () => {
    const t = "{n, plural, offset:2 =2 {just us} one {us and # more} other {us and # more}}";
    expect(fmt(t, { n: 2 })).toBe("just us");
    expect(fmt(t, { n: 3 })).toBe("us and 1 more");
    expect(fmt(t, { n: 1002 }, "de")).toBe("us and 1.000 more");
  });

  it.each([
    ["missing", {}],
    ["null", { n: null }],
    ["a word", { n: "many" }],
    ["a numeric string", { n: "1" }],
    ["NaN", { n: NaN }],
    ["an empty string", { n: "" }],
    ["a boolean", { n: true }],
    ["an object", { n: {} }],
  ])("renders {n} and reports missing_param when the count is %s", (_label, params) => {
    const env = sink();
    expect(fmt("You have {n, plural, one {# item} other {# items}}.", params, "en", env)).toBe(
      "You have {n}.",
    );
    expect(env.errors).toEqual([
      expect.objectContaining({ code: "missing_param", key: "k", locale: "en" }),
    ]);
  });

  it("names the argument type in the development message", () => {
    const env = sink();
    fmt("{n, selectordinal, other {#th}}", { n: "x" }, "en", env);
    expect(env.errors[0].message).toContain("{n, selectordinal} needs a number, got string");
  });

  it("renders an empty branch as empty text", () => {
    expect(fmt("[{n, plural, =0 {} other {#}}]", { n: 0 })).toBe("[]");
  });

  it("renders deeply nested arguments", () => {
    const t =
      "{a, plural, one {{b, select, x {{c, selectordinal, one {#st} other {#th}}} other {b}}} other {many}}";
    expect(fmt(t, { a: 1, b: "x", c: 2 })).toBe("2th");
    expect(fmt(t, { a: 1, b: "x", c: 21 })).toBe("21st");
    expect(fmt(t, { a: 5, b: "x", c: 1 })).toBe("many");
  });
});

describe("select", () => {
  const t = "{g, select, female {She} male {He} other {They}}";

  it("matches the value as a string and falls back to other", () => {
    expect(fmt(t, { g: "female" })).toBe("She");
    expect(fmt(t, { g: "unknown" })).toBe("They");
    expect(fmt("{v, select, 1 {one} true {yes} other {o}}", { v: 1 })).toBe("one");
    expect(fmt("{v, select, 1 {one} true {yes} other {o}}", { v: true })).toBe("yes");
  });

  it("never resolves a branch through Object.prototype", () => {
    for (const g of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(fmt(t, { g })).toBe("They");
    }
  });

  it("renders other and reports missing_param for a missing value", () => {
    const env = sink();
    expect(fmt(t, {}, "en", env)).toBe("They");
    expect(env.errors.map((e) => e.code)).toEqual(["missing_param"]);
  });

  it("renders params, tags and nested arguments inside the chosen branch", () => {
    const t2 =
      "{g, select, female {<b>{name}</b> has {n, plural, one {# cat} other {# cats}}} other {x}}";
    expect(
      fmt(t2, { g: "female", name: "Ann", n: 2, b: (c: readonly unknown[]) => `*${c.join("")}*` }),
    ).toBe("*Ann* has 2 cats");
  });

  it("accepts non-ASCII selectors", () => {
    expect(fmt("{g, select, жінка {Вона} other {Воно}}", { g: "жінка" }, "uk")).toBe("Вона");
  });
});

describe("argument shapes", () => {
  it("trims spaces around the name and the type", () => {
    expect(fmt("{  n  ,  plural  ,  other  {#}  }", { n: 3 })).toBe("3");
    expect(fmt("{ name }", { name: "x" })).toBe("x");
  });

  it("accepts a choice whose brace follows the selector directly", () => {
    expect(fmt("{n,plural,one{#}other{#s}}", { n: 2 })).toBe("2s");
  });

  it("resolves a parameter whose name ends in a type name", () => {
    expect(fmt("{myplural}", { myplural: "ok" })).toBe("ok");
  });

  it("keeps a quoted comma or brace inside a branch as text", () => {
    expect(fmt("{n, plural, other {a',' b '{x}' c}}", { n: 1 })).toBe("a',' b {x} c");
  });
});
