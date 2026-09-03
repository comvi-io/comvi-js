import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedHost";
import { createI18n } from "../../src";
import { TK_PLURAL } from "../../src/core/translate/cache";
import { icuCompiler } from "../../src/core/translate/compile-icu";

function ingest(template: string): void {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { msg: template } });
}

describe("ICU plural with a malformed choice list", () => {
  // Both cover parsePluralChoices' two bail-outs. A `'`-quoted span hides braces
  // from the tokenizer that scans the whole message but not from the choice
  // scanner, so the choice list it is handed can be malformed or unbalanced.

  it("throws E_ICU_SYNTAX for a choice whose key is not followed by an opening brace", () => {
    expect(() => ingest("{n, plural, zero '}one{ONE}'}")).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
  });

  it("throws E_ICU_SYNTAX for a choice whose opening brace has no matching close", () => {
    expect(() => ingest("{n, plural, '{one'}")).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
  });

  it("throws E_ICU_SYNTAX naming the select type for a malformed select choice list", () => {
    expect(() => ingest("{g, select, '{male'}")).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "select" }),
    );
  });
});

describe("a plural token an injected compiler built from a malformed list", () => {
  // `makeIcuArgToken` never emits a token for a list it could not parse, so the
  // render-time re-parse is only reachable through a compiler that emits the
  // token itself and borrows the ICU processor.
  it("renders empty instead of throwing when the re-parse fails", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: {
        makeArgToken: (content) => [TK_PLURAL, content, "'{one'"],
        processArgToken: icuCompiler.processArgToken,
      },
      translation: { en: { msg: "a{n}b" } },
    });

    expect(i18n.t("msg", { n: 1 })).toBe("ab");
  });
});
