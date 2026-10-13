/**
 * COM-148 in a production build: an argument whose comma sits only in a
 * nested brace group is not compiled at all. Both compilers render the braced
 * segment literally and report `E_ICU_SYNTAX` through `onError`, instead of
 * reading it as a parameter named after its inner text.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { simpleCompiler } from "../../src/core/translate/compile-simple";

describe.each([
  { name: "default compiler", compiler: simpleCompiler },
  { name: "icuCompiler", compiler: icuCompiler },
])("$name in production", ({ compiler }) => {
  it("renders `{{,}\\t}` literally and reports E_ICU_SYNTAX", () => {
    const reports: Error[] = [];
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler,
      onError: (error) => void reports.push(error),
      messages: { en: { odd: `x {{,}\t} y ${compiler === icuCompiler ? "i" : "s"}` } },
    });

    expect(i18n.t("odd", { "{,}": "PARAM" } as never)).toBe(
      `x {{,}\t} y ${compiler === icuCompiler ? "i" : "s"}`,
    );
    expect(reports.map((error) => (error as { code?: string }).code)).toEqual(["E_ICU_SYNTAX"]);
  });
});
