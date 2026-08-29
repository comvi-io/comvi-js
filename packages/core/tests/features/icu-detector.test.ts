import { describe, it, expect, beforeEach } from "vitest";
// The BASE host: the default compiler is the simple one, which is the whole
// subject of this file. Never the internal composite, never the tags entry.
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/icu";
import { clearTemplateCache } from "../../src/core/translate";
import { simpleCompiler, type IcuSyntaxError } from "../../src/core/translate/compile-simple";
import { parseTemplate } from "../../src/core/translate/parser";
import { TK_TEXT } from "../../src/core/translate/cache";
import { _resetSyntaxExtensions, type MessageCompiler } from "../../src/core/translate/syntax";

/**
 * The structured `E_ICU_SYNTAX` detector.
 *
 * A comma inside parsed braces is the ICU argument-type marker. On the default
 * compiler DEVELOPMENT THROWS at ingestion, which is this file's subject
 * (`__DEV__` is true under vitest); production renders the segment literally and
 * reports through `onError`. Neither side renders plausibly-wrong text.
 *
 * Most cases parse DIRECTLY, because ingesting an ICU catalog through the base
 * host throws at the dev preflight before any render can be attempted — and
 * `parseTemplate` is exactly what both seams call.
 */

/** Parse `template` on the default compiler and return the failure it throws. */
function parseFailure(template: string): IcuSyntaxError {
  let thrown: unknown;
  try {
    parseTemplate(template, false, [], simpleCompiler);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `"${template}" must throw`).toBeInstanceOf(Error);
  return thrown as IcuSyntaxError;
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("E_ICU_SYNTAX — the argument types the ICU compiler ships", () => {
  it.each([
    ["{count, plural, one {# item} other {# items}}", "plural"],
    ["{gender, select, male {he} female {she} other {they}}", "select"],
    ["{n, selectordinal, one {#st} other {#th}}", "selectordinal"],
  ])("%s throws with argumentType %s", (template, argumentType) => {
    const error = parseFailure(template);

    expect(error.code).toBe("E_ICU_SYNTAX");
    expect(error.argumentType).toBe(argumentType);
    // For a type the ICU compiler DOES ship, the guidance names both recipes.
    expect(error.message).toContain("@comvi/core/icu");
    expect(error.message).toContain(".with(icu())");
  });
});

describe("E_ICU_SYNTAX — argument types nothing in this package ships", () => {
  it.each([
    ["{v, number}", "number"],
    ["{v, number, integer}", "number"],
    ["{d, date, short}", "date"],
    ["{d, time}", "time"],
    ["{name, other}", "other"],
  ])("%s throws with the truthful parsed token %s", (template, argumentType) => {
    const error = parseFailure(template);

    expect(error.code).toBe("E_ICU_SYNTAX");
    expect(error.argumentType).toBe(argumentType);
    // `icuCompiler` does NOT implement these, so the guidance must never name it
    // as the fix.
    expect(error.message).toContain("is not a shipped ICU argument type");
    expect(error.message).not.toContain("icuCompiler");
  });
});

describe("E_ICU_SYNTAX — what the detector must NOT claim", () => {
  it("leaves an apostrophe-quoted literal alone", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { quoted: "'{name, other}'" } },
    });

    expect(i18n.t("quoted" as never)).toBe("{name, other}");
  });

  it("never sees an unbalanced brace — the parser rejects it first", () => {
    // `findMatchingBraceEnd` returns −1, so the comma never reaches the
    // compiler and the segment stays literal text.
    const i18n = createI18n({
      locale: "en",
      translation: { en: { broken: "x {count, plural" } },
    });

    expect(i18n.t("broken" as never)).toBe("x {count, plural");
  });

  it("leaves plain {param} interpolation untouched", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greet: "Hello, {name}!" } },
    });

    expect(i18n.t("greet" as never, { name: "Ada" } as never)).toBe("Hello, Ada!");
  });

  it("adds exactly `code` and `argumentType` to the Error baseline", () => {
    const error = parseFailure("{count, plural, other {#}}");

    const baseline = new Set(Object.getOwnPropertyNames(new Error("x")));
    expect(
      Object.getOwnPropertyNames(error)
        .filter((name) => !baseline.has(name))
        .sort(),
    ).toEqual(["argumentType", "code"]);
  });
});

describe("E_ICU_SYNTAX — repetition and bypass", () => {
  it("re-throws on every attempt: a failed parse is never cached", () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(parseFailure("{count, plural, other {#}}").code).toBe("E_ICU_SYNTAX");
    }
  });

  it("is bypassed by the ICU compiler and by any custom compiler", () => {
    const icu = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });
    expect(icu.t("items" as never, { count: 2 } as never)).toBe("2 items");

    const marker: MessageCompiler = {
      makeArgToken(content) {
        return [TK_TEXT, `«${content.trim().split(",")[0]}»`];
      },
    };
    const custom = createI18n({
      locale: "en",
      compiler: marker,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });
    expect(custom.t("items" as never, { count: 2 } as never)).toBe("«count»");
  });
});
