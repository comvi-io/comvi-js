import { describe, expect, it, vi } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { TranslationResult } from "../../src";

function render(template: string, params: Record<string, unknown>): string | TranslationResult {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { k: template } });
  return i18n.t("k", params as never);
}

describe("arguments the ICU compiler does not treat as plural or select", () => {
  it("resolves a parameter whose name ends in a type name", () => {
    expect(render("{plurals}", { plurals: 3 })).toBe("3");
  });

  it.each([
    [
      "a two-part argument with no known type",
      "{x, plurals}",
      { x: 1 },
      '[i18n] Missing parameter "x, plurals" for template "{x, plurals}"',
    ],
    [
      "an argument type this package does not ship",
      "{value, number, integer}",
      { value: 5 },
      '[i18n] Missing parameter "value, number, integer" for template "{value, number, integer}"',
    ],
    [
      "a plural with no choice list",
      "{n, plural}",
      { n: 1 },
      '[i18n] Missing parameter "n, plural" for template "{n, plural}"',
    ],
  ])(
    "%s renders verbatim and warns which parameter is missing",
    (_label, template, params, warning) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const rendered = render(template, params);

      expect(rendered).toBe(template);
      expect(warnSpy).toHaveBeenCalledWith(warning);
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

  it.each([
    [1, "one"],
    [5, ""],
  ])(
    "stops at a selector with no braced value, keeping the choices before it (count %i)",
    (count, expected) => {
      expect(render("{count, plural, one {one} other oops}", { count })).toBe(expected);
    },
  );
});
