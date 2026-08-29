import { describe, expect, it } from "vitest";
import { icuCompiler } from "../../src/icu";
import { I18n } from "../helpers/composedHost";

// Probed on the published compiler object: `argOpensHashScope` is the
// `MessageCompiler` member the parser calls to decide where `#` is substituted.
const opensHashScope = icuCompiler.argOpensHashScope!;

describe("icuCompiler.argOpensHashScope()", () => {
  it.each([
    ["a plural argument", true, "{n, plural, one {#} other {#}}"],
    ["a selectordinal argument", true, "{n, selectordinal, one {#} other {#}}"],
    ["a plural whose type is ended by the closing brace", true, "{n, plural}"],
    ["a plural whose type is ended by a space", true, "{n, plural , one {#}}"],
    ["a plural whose type is ended by an opening brace", true, "{n, plural{one {#}}}"],
    ["a select argument", false, "{n, select, a {x} other {y}}"],
    ["a plain parameter", false, "{name}"],
    ["an argument that never reaches a comma", false, "{count"],
    ["an already closed argument followed by plural-looking text", false, "{a} x, plural"],
  ])("%s → %s", (_label, expected, template) => {
    expect(opensHashScope(template, 0, template.length)).toBe(expected);
  });
});

describe("# substitution inside a plural branch", () => {
  it("substitutes # in branch text that merely reads like a nested plural", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { forms: "{count, plural, other {Nouns, plural, # forms}}" } });

    expect(i18n.t("forms", { count: 3 })).toBe("Nouns, plural, 3 forms");
  });

  // `'#{'` is the ICU escape for a literal brace, and it is a quoted section only
  // while `#` counts as syntax — get that wrong and the nested plural is measured
  // to the wrong closing brace, which swallows the outer `#`.
  it("substitutes a trailing # after a nested plural whose branch escapes a brace as '#{'", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      en: { msg: "{files, plural, other {{folders, plural, other {a'#{'b}} #}}" },
    });

    expect(i18n.t("msg", { files: 5, folders: 2 })).toBe("a#{b 5");
  });
});
