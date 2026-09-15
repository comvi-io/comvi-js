/**
 * The closing-tag scanner used to skip backslash escapes but not ICU
 * apostrophe-quoted sections, so a `</b>` written inside quoted literal text
 * terminated the tag that surrounded it. The scanner now runs the parser's own
 * `advancePastApostrophe`, under the same `#`-is-syntax context the tag was
 * parsed in. RC review #7.
 */
import { describe, expect, it } from "vitest";
import { createI18n } from "../helpers/composedHost";
import type { TagCallbackParams, TranslationParams } from "../../src/types";

/** A handler per tag name, so an accepted tag shows up as `[name:children]`. */
function handlers(...names: string[]): TranslationParams {
  return Object.fromEntries(
    names.map((name) => [name, ({ children }: TagCallbackParams) => `[${name}:${children}]`]),
  );
}

function render(template: string, params: TranslationParams = {}): string {
  const i18n = createI18n({ locale: "en", translation: { en: { msg: template } } });
  return i18n.t("msg", params) as string;
}

describe("a closing tag inside an ICU-quoted section", () => {
  it("stays literal text inside the tag that surrounds it", () => {
    expect(render("<b>'{x </b> y}'</b>", handlers("b"))).toBe("[b:{x </b> y}]");
  });

  it("stays literal when the quote is opened by '}", () => {
    expect(render("<b>'}x </b> y{'</b>", handlers("b"))).toBe("[b:}x </b> y{]");
  });

  it("does not end the OUTER tag of a nested pair", () => {
    expect(render("<b><i>'{</i>}'</i>Z</b>", handlers("b", "i"))).toBe("[b:[i:{</i>}]Z]");
  });

  it("stays literal inside a plural sub-message, where # is syntax too", () => {
    expect(render("{n, plural, other {<b>'{# </b>}'</b> ok}}", { n: 2, ...handlers("b") })).toBe(
      "[b:{# </b>}] ok",
    );
  });
});

describe("an apostrophe that ICU quoting does not claim", () => {
  // DOUBLE_OPTIONAL quoting opens a literal only before `{`, `}` or a `#` in
  // plural context. `'<` is none of those, so a `'</b>'` outside braces must
  // keep closing the tag exactly as it did.
  it("leaves a bare apostrophe as text and lets the tag close", () => {
    expect(render("<b>a'</b>", handlers("b"))).toBe("[b:a']");
  });

  it("collapses a doubled apostrophe without protecting what follows", () => {
    expect(render("<b>a''</b>", handlers("b"))).toBe("[b:a']");
  });

  it("still lets a backslash escape hide a closing tag", () => {
    expect(render("<b>a\\</b>b</b>", handlers("b"))).toBe("[b:a</b>b]");
  });
});
