import { describe, expect, it } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { TranslationResult } from "../../src";

function render(template: string, params: Record<string, unknown>): string | TranslationResult {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { k: template } });
  return i18n.t("k", params as never);
}

/** Ingestion alone: development preflights every catalog string it is handed. */
function ingest(template: string): void {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { k: template } });
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

  it("names the unsupported type and the two ways out in the thrown message", () => {
    expect(() => ingest("{value, number, integer}")).toThrow(
      "[i18n] ICU argument type `number` is not supported; quote the braces ('{'…'}') or " +
        "format the value in code and pass it as a plain {param}",
    );
  });
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
