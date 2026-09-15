import { describe, expect, it } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { TranslationResult } from "../../src";

function render(template: string, params: Record<string, unknown>): string | TranslationResult {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { k: template } });
  return i18n.t("k", params as never);
}

describe("t() with ICU select — branch lookup", () => {
  it("looks a missing select parameter up as the empty string", () => {
    expect(render("{gender, select, {anon} other {named}}", {})).toBe("anon");
  });
});

// `&` and `\` are offered to the syntax extensions exactly like `<`, so the
// tag grammar's entities and its `\<` escape are syntax wherever tag syntax is
// registered. A selected sub-message used to be re-parsed only when it held
// `{`, `<` or `'`, which made a branch of plain text keep `&amp;` escaped
// while the same text one level up decoded — and made ADDING a parameter to
// the branch change the entity's rendering. RC review #5.
describe("t() with ICU select — extension syntax in a branch", () => {
  it.each([
    ["an entity at the top level decodes", "a &amp; b", {}, "a & b"],
    [
      "an entity in a plain branch decodes the same way",
      "{g, select, other {a &amp; b}}",
      {},
      "a & b",
    ],
    [
      "an entity in a parameterized branch decodes the same way",
      "{g, select, other {a &amp; b {x}}}",
      { x: "c" },
      "a & b c",
    ],
    ["a \\< escape in a plain branch decodes", "{g, select, other {a \\< b}}", {}, "a < b"],
    [
      "an entity in the branch the parameter selects decodes",
      "{g, select, one {1 &amp; 1} other {no}}",
      { g: "one" },
      "1 & 1",
    ],
  ])("%s", (_label, template, params, expected) => {
    expect(render(template, params)).toBe(expected);
  });
});

describe("t() with ICU plural — extension syntax in a branch", () => {
  it.each([
    [
      "an entity in a plain branch decodes",
      "{n, plural, one {one &amp; only} other {many &amp; more}}",
      { n: 2 },
      "many & more",
    ],
    [
      "an entity in a parameterized branch decodes the same way",
      "{n, plural, other {many &amp; more {x}}}",
      { n: 2, x: "!" },
      "many & more !",
    ],
    [
      "an entity beside a # keeps the count",
      "{n, plural, other {# &amp; counting}}",
      { n: 3 },
      "3 & counting",
    ],
    ["a \\< escape in a plain branch decodes", "{n, plural, other {a \\< b}}", { n: 2 }, "a < b"],
  ])("%s", (_label, template, params, expected) => {
    expect(render(template, params)).toBe(expected);
  });

  it("still substitutes the count into a branch with no extension syntax", () => {
    expect(render("{n, plural, one {# item} other {# items}}", { n: 4 })).toBe("4 items");
  });
});
