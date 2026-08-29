import { describe, it, expect, beforeEach } from "vitest";
import { createI18n } from "../../src";
import { createI18n as createFullI18n } from "../../src/core/full";
import { clearTemplateCache, translate, translateTemplate } from "../../src/core/translate";
import { simpleCompiler } from "../../src/core/translate/compile-simple";
import { _resetSyntaxExtensions } from "../../src/core/translate/syntax";

// Two default argument values no in-repo caller exercises: hosts pass both explicitly.

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("translate() defaults", () => {
  it("renders an absent parameter as its literal placeholder", () => {
    const result = translate("Hi {name}!", "en", {}, undefined, simpleCompiler);

    expect(result).toBe("Hi {name}!");
  });
});

describe("translateTemplate() defaults", () => {
  it("renders an absent parameter as its literal placeholder", () => {
    const result = translateTemplate("Hi {name}!", {}, "en", undefined, simpleCompiler);

    expect(result).toBe("Hi {name}!");
  });
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
    expect(i18n.t("rank", { kind: "sharp" })).toBe("'#'1");
  });
});
