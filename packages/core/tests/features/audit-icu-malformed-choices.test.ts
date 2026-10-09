import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedInstance";
import { createI18n } from "../../src";
import { TK_PLURAL, TK_SELECT } from "../../src/core/translate/cache";
import { icuCompiler } from "../../src/core/translate/compile-icu";

function ingest(template: string): void {
  const i18n = new I18n({ locale: "en" });
  i18n.addMessages({ en: { msg: template } });
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
  it("re-parses the list as a plural sub-message, where a quoted # hides a brace", () => {
    // `'#}'` is one quoted literal only where `#` is syntax, which it is inside
    // a plural. Read without that context the `}` closes the sub-message early
    // and the rest of the list is malformed.
    const i18n = createI18n({
      locale: "en",
      compiler: {
        makeArgToken: (content) => [TK_PLURAL, content, "other {'#}' left}"],
        processArgToken: icuCompiler.processArgToken,
      },
      messages: { en: { msg: "a{n}b" } },
    });

    expect(i18n.t("msg", { n: 1 })).toBe("a#} leftb");
  });

  it("re-parses a select token's list the same way", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: {
        makeArgToken: (content) => [TK_SELECT, content, "other {chosen}"],
        processArgToken: icuCompiler.processArgToken,
      },
      messages: { en: { msg: "a{g}b" } },
    });

    expect(i18n.t("msg", { g: "any" })).toBe("achosenb");
  });

  it("renders empty instead of throwing when the re-parse fails", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: {
        makeArgToken: (content) => [TK_PLURAL, content, "'{one'"],
        processArgToken: icuCompiler.processArgToken,
      },
      messages: { en: { msg: "a{n}b" } },
    });

    expect(i18n.t("msg", { n: 1 })).toBe("ab");
  });
});
