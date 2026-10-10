import { beforeEach, describe, expect, it } from "vitest";
import { I18n } from "../helpers/composedInstance";
import { _templateCacheSize, clearTemplateCache } from "../../src/core/translate";
import type { TranslationResult } from "../../src";

function render(template: string, params: Record<string, unknown>): string | TranslationResult {
  const i18n = new I18n({ locale: "en" });
  i18n.addMessages({ en: { k: template } });
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

// A bare `&` is ordinary copy — "Terms & Conditions", "AT&T" — and only an
// entity opener when a name or a `#` follows it. Treating every `&` as a
// trigger sent branches of plain text back through the parser for
// byte-identical output, which the perf gate's "branch with a bare &" case
// measured at +27%. The observable is the template cache: a branch that took
// the text-only path leaves no entry of its own. Combined review LOW.
describe("a bare ampersand in a plural or select branch", () => {
  /** Entries added by rendering `template` once, the message's own included. */
  function entriesFor(template: string, params: Record<string, unknown>): number {
    const i18n = new I18n({ locale: "en" });
    i18n.addMessages({ en: { k: template } });
    // The dev ingestion preflight has already parsed the message; clearing
    // here makes the count the RENDER's own.
    clearTemplateCache();
    i18n.t("k", params as never);
    return _templateCacheSize();
  }

  beforeEach(() => {
    clearTemplateCache();
  });

  it.each([
    ["a plural branch", "{n, plural, other {Terms & Conditions}}", { n: 2 }],
    ["a select branch", "{g, select, other {Terms & Conditions}}", {}],
  ])("renders unchanged and is not re-parsed in %s", (_label, template, params) => {
    expect(render(template, params)).toBe("Terms & Conditions");
    expect(entriesFor(template, params)).toBe(1);
  });

  it("costs no more than the same branch with no ampersand at all", () => {
    expect(entriesFor("{n, plural, other {Terms and Conditions}}", { n: 2 })).toBe(1);
  });

  it("still re-parses a branch holding a real entity, and decodes it", () => {
    const template = "{n, plural, other {Terms &amp; Conditions}}";

    expect(render(template, { n: 2 })).toBe("Terms & Conditions");
    expect(entriesFor(template, { n: 2 })).toBe(2);
  });

  it("re-parses a branch where a letter follows the ampersand, output unchanged", () => {
    // `&T` could open an entity, so the parser has to look; no extension
    // claims it, and it stays the literal it was.
    const template = "{n, plural, other {AT&T calling}}";

    expect(render(template, { n: 2 })).toBe("AT&T calling");
    expect(entriesFor(template, { n: 2 })).toBe(2);
  });

  it("re-parses a branch where a # follows the ampersand, output unchanged", () => {
    const template = "{g, select, other {code &#38; here}}";

    expect(render(template, {})).toBe("code &#38; here");
    expect(entriesFor(template, {})).toBe(2);
  });
});
