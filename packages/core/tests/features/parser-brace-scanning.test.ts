import { describe, it, expect } from "vitest";
import { createI18n } from "../helpers/composedHost";
import { findMatchingBraceEnd, type ArgOpensHashScope } from "../../src/core/translate/parser";
import type { TranslationParams } from "../../src/types";

/**
 * Walking a `{…}` argument to its closing brace while tracking whether `#` is
 * currently syntax — a per-brace-depth fact, because only a
 * plural/selectordinal sub-message rebinds `#`. The tracking is observable
 * through `'#'`: quoting swallows a `}` where `#` is syntax and leaves it
 * structural where it is not.
 */

function render(template: string, params: TranslationParams): string {
  const i18n = createI18n({ locale: "en", translation: { en: { msg: template } } });
  return i18n.t("msg", params) as string;
}

describe("`'#'` quoting per sub-message", () => {
  it("a plural sub-message rebinds `#` → `'#'` is a quoted literal", () => {
    const rendered = render("{n, plural, other {'#' left}}", { n: 2 });

    expect(rendered).toBe("# left");
  });

  it("a standalone select does not rebind `#` → `'#'` stays two literal characters", () => {
    const rendered = render("{sel, select, other {'#' left}}", { sel: "x" });

    expect(rendered).toBe("'#' left");
  });

  it("the quoted section a plural opens swallows a `}` instead of ending the branch", () => {
    const rendered = render("{n, plural, other {'#}' left}}", { n: 2 });

    expect(rendered).toBe("#} left");
  });
});

/**
 * The brace scanner reports where the argument ends as an INDEX, and the
 * depth-by-depth restore below is only visible in that index — a rendered
 * string cannot say which `}` the scan stopped at. The fixtures use a stand-in
 * `opensHashScope` (`{P…}` opens a scope) so a failure points at the scanner
 * rather than at ICU plural detection. `needs-seam`: the export carries no
 * `@internal` tag, so nothing in src marks it as a sanctioned test seam.
 */
describe("findMatchingBraceEnd()", () => {
  const opensAtP: ArgOpensHashScope = (str, braceIndex) => str.charCodeAt(braceIndex + 1) === 0x50;

  it("a balanced argument → the index after the matching `}`", () => {
    const end = findMatchingBraceEnd("{abc}", 1, 5, false);

    expect(end).toBe(5);
  });

  it("braces that never balance → -1", () => {
    const end = findMatchingBraceEnd("{ab", 1, 3, false);

    expect(end).toBe(-1);
  });

  it("a nested brace pair with no opensHashScope probe → still balanced", () => {
    const end = findMatchingBraceEnd("{a{b}c}", 1, 7, false);

    expect(end).toBe(7);
  });

  it.each([
    { hash: true, of: "swallows the `}` it quotes", expected: 7 },
    { hash: false, of: "leaves that `}` structural", expected: 4 },
  ])("`'#}'` with hashIsSyntax=$hash $of → the scan ends at $expected", ({ hash, expected }) => {
    const end = findMatchingBraceEnd("{'#}'x}", 1, 7, hash);

    expect(end).toBe(expected);
  });

  it("a nested argument that opens a hash scope → `'#'` quotes inside it", () => {
    const end = findMatchingBraceEnd("{a{P'#}'x}b}", 1, 12, false, opensAtP);

    expect(end).toBe(12);
  });

  it("a nested argument that opens no hash scope → `'#'` stays literal inside it", () => {
    const end = findMatchingBraceEnd("{a{q'#}'x}b}", 1, 12, false, opensAtP);

    expect(end).toBe(10);
  });

  it("a nested argument closing → the outer hash scope is restored", () => {
    const end = findMatchingBraceEnd("{a{P}'#}'x}", 1, 11, false, opensAtP);

    expect(end).toBe(8);
  });
});
