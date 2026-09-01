import { describe, it, expect, beforeEach } from "vitest";
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
