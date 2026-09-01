import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedHost";

function render(template: string): string {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { msg: template } });
  return i18n.t("msg", { n: 1 });
}

describe("ICU plural with a malformed choice list", () => {
  // Both pin parsePluralChoices' two bail-outs. A `'`-quoted span hides braces
  // from the tokenizer that scans the whole message but not from the choice
  // scanner, so the choice list it is handed can be malformed or unbalanced.

  it("stops at a choice whose key is not followed by an opening brace", () => {
    expect(render("{n, plural, zero '}one{ONE}'}")).toBe("");
  });

  it("stops at a choice whose opening brace has no matching close", () => {
    expect(render("{n, plural, '{one'}")).toBe("");
  });
});
