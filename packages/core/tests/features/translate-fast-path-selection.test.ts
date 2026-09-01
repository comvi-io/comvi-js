import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createI18n } from "../../src";
import { clearTemplateCache } from "../../src/core/translate";
import type { ParsedToken } from "../../src/core/translate/cache";
import {
  _resetSyntaxExtensions,
  registerSyntaxExtension,
  type SyntaxExtension,
} from "../../src/core/translate/syntax";
import { createElement } from "../../src/virtualNode";

// Which fast path a template is classified into must never change what it renders.

const node = createElement("b", {}, ["bold"]);

/** Token kind of the extension below: outside the `TK_*` range the core owns. */
const TK_LONE = 91 as unknown as ParsedToken[0];

/** An extension claiming a SINGLE character, so the template can be that character alone. */
function makeLoneCharExtension(char: string, rendered: string): SyntaxExtension {
  return {
    id: `test:lone-${char}`,
    cacheBit: 4,
    parseHook: (template, index) =>
      template.charCodeAt(index) === char.charCodeAt(0)
        ? { token: [TK_LONE, rendered] as ParsedToken, endIndex: index + 1 }
        : undefined,
    processHook: (token) => (token[0] === TK_LONE ? token[1] : undefined),
  };
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

describe("an empty-string parameter before a node parameter, in a template that also has text", () => {
  // The trailing text is what keeps this distinct from the text-free case: it is the token
  // that decides whether the template is classified as simple-params at all.
  it("contributes no part of its own", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "{empty}{node}!" } },
    });

    const parts = i18n.tRaw("msg" as never, { empty: "", node } as never);

    expect(parts).toEqual([node, "!"]);
  });
});

describe("a template made of a single character an extension claims", () => {
  // `<` and `&` are two of the characters the special-character scan looks for before it
  // short-circuits to "return the raw template"; a template that is ONLY that character is
  // the one input where missing it changes the output.
  it.each([
    ["less-than", "<", "LT"],
    ["ampersand", "&", "AMP"],
  ])("renders a lone %s through the extension", (_label, char, rendered) => {
    registerSyntaxExtension(makeLoneCharExtension(char, rendered));
    const i18n = createI18n({ locale: "en", translation: { en: { msg: char } } });

    expect(i18n.t("msg" as never)).toBe(rendered);
  });
});
