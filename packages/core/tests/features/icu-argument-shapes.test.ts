import { describe, expect, it, vi } from "vitest";
import { I18n } from "../helpers/composedInstance";
import type { TranslationResult } from "../../src";

function render(template: string, params: Record<string, unknown>): string | TranslationResult {
  const i18n = new I18n({ locale: "en" });
  i18n.addMessages({ en: { k: template } });
  return i18n.t("k", params as never);
}

/** Ingestion alone: development preflights every catalog string it is handed. */
function ingest(template: string): void {
  const i18n = new I18n({ locale: "en" });
  i18n.addMessages({ en: { k: template } });
}

describe("arguments the ICU compiler does not treat as plural or select", () => {
  it("resolves a parameter whose name ends in a type name", () => {
    expect(render("{plurals}", { plurals: 3 })).toBe("3");
  });

  it.each([
    ["an argument type this package does not ship", "{value, number, integer}", "number"],
    ["a two-part argument with no known type", "{x, plurals}", "plurals"],
    ["a plural with no choice list", "{n, plural}", "plural"],
  ])("%s throws E_ICU_SYNTAX at ingestion", (_label, template, argumentType) => {
    expect(() => ingest(template)).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType }),
    );
  });

  it.each([["{value, number, integer}"], ["{n, plural}"]])(
    "quotes %s and names the three supported types in the thrown message",
    (template) => {
      expect(() => ingest(template)).toThrow(
        `[@comvi/core] ICU argument \`${template}\` is not supported: this compiler implements ` +
          "`plural`, `selectordinal` and `select`, each with a choice list like `other {…}`. " +
          "Quote the braces ('{'…'}') or format the value in code and pass it as a plain {param}",
      );
    },
  );

  it("throws E_ICU_SYNTAX for a choice list whose first selector has a quoted brace", () => {
    // `'}'` hides the brace from the sub-message scanner but not from the
    // selector scanner, so the list bails out on the very first selector — the
    // one shape where nothing later in the list can bail out instead.
    expect(() => ingest("{n, plural, a '}' {x}}")).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
  });

  // `argOpensHashScope` stops at EITHER brace in the parameter name, so `#` is
  // not syntax inside these arguments; the apostrophe before `}` then opens a
  // quote that never closes and the argument never terminates. One case per
  // brace, because a name can hold an unmatched one inside quotes.
  it.each([["{a{x}, plural, other {'#'}}"], ["{'{'x, plural, other {'#'}}"]])(
    "does not open a hash scope for %s, whose parameter name holds a brace",
    (template) => {
      const i18n = new I18n({ locale: "en", messages: { en: { k: template } } });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(i18n.t("k", { a: 1 } as never)).toBe(template);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unbalanced braces"));
    },
  );
});

describe("ICU argument name and choice-list parsing", () => {
  it("keeps braces inside an argument name out of the type split", () => {
    expect(render("{p{q}, select, other {yes}}", {})).toBe("yes");
  });

  it("keeps a comma nested in an argument name out of the type split", () => {
    expect(render("{p{a,b}, select, other {yes}}", {})).toBe("yes");
  });

  it("skips a quoted brace in an argument name but leaves the quotes in the parameter key", () => {
    expect(render("{'{'x, plural, one {# item} other {# items}}", { "'{'x": 2 })).toBe("2 items");
  });

  it("trims the spaces around an argument name", () => {
    expect(render("{ count , plural, one {# item} other {# items}}", { count: 2 })).toBe("2 items");
  });

  it("accepts a choice whose brace follows the selector directly", () => {
    expect(render("{count, plural, one{# item} other{# items}}", { count: 2 })).toBe("2 items");
  });

  it("still takes the =N branch when an earlier selector name ends in =", () => {
    expect(render("{n, plural, x= {a} =3 {three} other {o}}", { n: 3 })).toBe("three");
  });

  it("throws E_ICU_SYNTAX for a selector with no braced value", () => {
    expect(() => ingest("{count, plural, one {one} other oops}")).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
  });
});

describe("arguments nested inside a plural or select branch", () => {
  // The preflight must descend into branch text: a broken argument one level
  // down is still "where the catalog was added", not "first render".
  it.each([
    [
      "an unsupported type inside a plural branch",
      "{n, plural, other {{price, number}}}",
      "number",
    ],
    [
      "a malformed nested plural inside a plural branch",
      "{n, plural, other {{m, plural, one {a} other oops}}}",
      "plural",
    ],
    ["an unsupported type inside a select branch", "{g, select, other {{d, date}}}", "date"],
    [
      "an unsupported type two levels down",
      "{n, plural, other {{g, select, other {{price, number}}}}}",
      "number",
    ],
  ])("%s throws E_ICU_SYNTAX at ingestion via addMessages", (_label, template, argumentType) => {
    expect(() => ingest(template)).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType }),
    );
  });

  it("an unsupported type inside a plural branch throws E_ICU_SYNTAX at construction via translation:", () => {
    expect(
      () =>
        new I18n({
          locale: "en",
          messages: { en: { k: "{n, plural, other {{price, number}}}" } },
        }),
    ).toThrow(expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "number" }));
  });

  it("a well-formed nested plural ingests and renders both counts", () => {
    expect(
      render("{n, plural, other {{m, plural, one {# thing} other {# things}} in #}}", {
        n: 3,
        m: 1,
      }),
    ).toBe("1 thing in 3");
  });
});

describe("preflight scope: where `#` is syntax and where tags nest", () => {
  // A tag's direct children are compiled by the tag extension during the outer
  // parse; a plural INSIDE the tag stores its branches verbatim, so only the
  // walk descending through the tag reaches the broken argument.
  it.each([
    ["directly", "<b>{price, number}</b>"],
    ["inside a plural branch", "<b>{n, plural, other {{price, number}}}</b>"],
  ])(
    "an unsupported type %s inside a tag's children throws E_ICU_SYNTAX at ingestion",
    (_label, template) => {
      expect(() => ingest(template)).toThrow(
        expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "number" }),
      );
    },
  );

  // Outside a plural, `'#` is a literal apostrophe followed by a literal hash,
  // so the argument after it is real and must be preflighted.
  // (A top-level SELECT branch would be the other place `'#` stays literal, but
  // `'#{…}'` inside one trips the outer brace scanner first — pre-existing, and
  // the preflight then never sees the branch — so the top level is the probe.)
  it("at the top level, '#…' does not quote — the argument inside throws at ingestion", () => {
    expect(() => ingest("'#{price, number}'")).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "number" }),
    );
  });

  // Inside a plural (directly or through a nested select), `'#` opens a quote,
  // so the same characters are literal text and nothing is compiled.
  it.each([
    ["directly inside a plural branch", "{n, plural, other {'#{price, number}'}}"],
    [
      "inside a select nested in a plural branch",
      "{n, plural, other {{g, select, other {'#{price, number}'}}}}",
    ],
  ])("%s, '#…' quotes — the text ingests", (_label, template) => {
    expect(() => ingest(template)).not.toThrow();
  });
});
