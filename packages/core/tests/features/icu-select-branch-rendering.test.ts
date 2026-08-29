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

describe("t() with ICU select — branch rendering", () => {
  // The entity survives escaped unless something else in the branch forces a re-parse.
  it.each([
    [
      "a branch of plain text is returned verbatim",
      "{g, select, other {a &amp; b}}",
      {},
      "a &amp; b",
    ],
    [
      "a branch containing an argument is re-processed",
      "{g, select, other {a &amp; b {x}}}",
      { x: "c" },
      "a & b c",
    ],
  ])("%s", (_label, template, params, expected) => {
    expect(render(template, params)).toBe(expected);
  });
});
