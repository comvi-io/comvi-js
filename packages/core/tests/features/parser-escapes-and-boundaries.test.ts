import { describe, it, expect } from "vitest";
// The BASE host: no tag extension in the graph, so the core grammar is the
// only thing claiming characters here.
import { createI18n } from "../../src";
import { advancePastApostrophe } from "../../src/core/translate/parser";
import { tagSyntaxExtension } from "../../src/core/translate/tags";
import { makeMarkerExtension } from "../helpers/extensions";
import type { SyntaxExtension } from "../../src/core/translate/syntax";

/**
 * ICU DOUBLE_OPTIONAL apostrophe quoting and the order in which the scanner
 * offers a claimed character to the syntax extensions.
 *
 * The unclaimed-`<` development warning lives in `ambient-tags-warning.test.ts`,
 * which owns that subject and resets the module globals it depends on.
 */

function render(template: string, params?: Record<string, unknown>): string {
  const i18n = createI18n({ locale: "en", translation: { en: { msg: template } } });
  return i18n.t("msg" as never, params as never) as string;
}

/**
 * `skipQuotedSection` runs only while the scanner hunts for the `}` that ends
 * an argument, and it reports that position as an index. Its off-by-one
 * boundaries are pinned on the function because a rendered string cannot say
 * which index the scan stopped at. `needs-seam`: the export carries no
 * `@internal` tag, so nothing in src marks it as a sanctioned test seam.
 */
describe("advancePastApostrophe()", () => {
  it.each([
    { of: "`''` is a literal apostrophe", str: "a''b", at: 1, hash: false, expected: 3 },
    { of: "`'` before ordinary text is literal", str: "a'b", at: 1, hash: false, expected: 2 },
    { of: "`'` before `{` opens a quoted section", str: "a'{x}", at: 1, hash: false, expected: 5 },
    { of: "`'#` quotes where `#` is syntax", str: "a'#b", at: 1, hash: true, expected: 4 },
    { of: "`'#` is literal where `#` is not", str: "a'#b", at: 1, hash: false, expected: 2 },
    { of: "`'` before a non-`#` where `#` is syntax", str: "a'b", at: 1, hash: true, expected: 2 },
    { of: "an unterminated quoted section", str: "'{ab", at: 0, hash: false, expected: 4 },
    { of: "`''` inside a quoted section", str: "'{a''b}c", at: 0, hash: false, expected: 8 },
    { of: "`'` closing a quoted section", str: "'{a}'x", at: 0, hash: false, expected: 5 },
  ])("$of in $str → the scan resumes at $expected", ({ str, at, hash, expected }) => {
    const resumeAt = advancePastApostrophe(str, at, str.length, hash);

    expect(resumeAt).toBe(expected);
  });
});

describe("apostrophe quoting through t()", () => {
  it.each([
    { of: "an apostrophe inside a word", template: "don't", expected: "don't" },
    {
      of: "a possessive apostrophe",
      template: "Superiors' behavior",
      expected: "Superiors' behavior",
    },
    { of: "`''` between text", template: "a''b", expected: "a'b" },
    { of: "a leading `''`", template: "''x", expected: "'x" },
    { of: "a quoted section opening at index 0", template: "'{x}'y", expected: "{x}y" },
    { of: "an unterminated quoted section", template: "'{ab", expected: "{ab" },
    { of: "`'#'` outside any plural sub-message", template: "'#'", expected: "'#'" },
  ])("$of: $template → $expected", ({ template, expected }) => {
    const rendered = render(template);

    expect(rendered).toBe(expected);
  });

  it("`'` does not quote a `}` inside a placeholder name when `#` is not syntax", () => {
    const rendered = render("{x'#}'y}", { "x'#": "V" });

    expect(rendered).toBe("V'y}");
  });
});

describe("offering a claimed character to the extension set", () => {
  function renderWith(extensions: SyntaxExtension[]): string {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "a&mark;b" } },
      tagInterpolation: { extensions },
    });
    return i18n.t("msg" as never) as string;
  }

  it("the first extension to claim the position is the one whose token is used", () => {
    const rendered = renderWith([makeMarkerExtension(), tagSyntaxExtension]);

    expect(rendered).toBe("a!b");
  });

  it("a declining extension does not stop the position being offered to the next", () => {
    const rendered = renderWith([tagSyntaxExtension, makeMarkerExtension()]);

    expect(rendered).toBe("a!b");
  });
});
