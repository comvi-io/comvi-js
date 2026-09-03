import { describe, it, expect, beforeEach, vi } from "vitest";
import { createI18n } from "../../src";
import { createI18n as createFullI18n } from "../../src/core/full";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetSyntaxExtensions } from "../../src/core/translate/syntax";

// `#` is plural syntax only INSIDE a plural branch. At the top level it is
// ordinary text, so `'#'` must survive as the three literal characters — on
// every entry point, and on every render of the same template.

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("a per-call fallback template", () => {
  it("keeps a quoted # literal, because # is not syntax at the top level", () => {
    const i18n = createI18n({ locale: "en" });

    expect(i18n.t("absent" as never, { fallback: "rank '#'1" } as never)).toBe("rank '#'1");
  });
});

describe("a select rendered twice", () => {
  it("keeps a quoted # in the chosen branch literal on the second render", () => {
    // The second render takes the compiled-template branch; a `#` scope leaking
    // into it would re-parse the branch under plural rules.
    const i18n = createFullI18n({
      locale: "en",
      translation: { en: { rank: "{kind, select, sharp{'#'1} other{plain}}" } },
    });
    expect(i18n.t("rank", { kind: "sharp" })).toBe("'#'1");

    const second = i18n.t("rank", { kind: "sharp" });

    expect(second).toBe("'#'1");
  });
});

describe("a select's own hash context", () => {
  // `'` starts a quoted literal only before a syntax character. Inside a plural
  // sub-message `#` is syntax, so `'#'` is a quoted hash; at the top level it is
  // not, so the SECOND apostrophe — the one before `}` — opens a quote that
  // never closes and the choice list cannot be parsed.

  it("renders a top-level select whose branch quotes a # literally, braces unbalanced", () => {
    // The first apostrophe is ordinary text here, so the second one — before
    // `}` — opens a quote that swallows both closing braces. The argument never
    // closes, so the whole template stays literal.
    const template = "{kind, select, other {'#'}}";
    const i18n = createFullI18n({ locale: "en", translation: { en: { rank: template } } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(i18n.t("rank", { kind: "any" })).toBe(template);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unbalanced braces"));
  });

  it("renders a quoted # in a select branch nested in a plural as the literal", () => {
    const i18n = createFullI18n({
      locale: "en",
      translation: { en: { rank: "{n, plural, other {{kind, select, other {'#' of #}}}}" } },
    });

    expect(i18n.t("rank", { n: 3, kind: "any" })).toBe("# of 3");
  });

  it("renders a top-level select branch whose apostrophes do not sit against a brace", () => {
    // The mirror of the case above, and the reason it is not a defect: move the
    // second apostrophe off the `}` and nothing quotes, so `'`, `#` and the
    // argument all come through. Both halves match the reference ICU parser
    // (@formatjs/icu-messageformat-parser 2.x): it accepts this template with
    // the same literal segments and rejects `{kind, select, other {'#'}}` with
    // EXPECT_ARGUMENT_CLOSING_BRACE, exactly as the scanner does.
    const i18n = createFullI18n({
      locale: "en",
      translation: { en: { rank: "{kind, select, other {'#{x}' tail}}" } },
    });

    expect(i18n.t("rank", { kind: "any", x: 7 })).toBe("'#7' tail");
  });
});
