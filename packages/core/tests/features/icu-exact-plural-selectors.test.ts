/**
 * ICU explicit plural selectors are `=` followed by a NUMBER, and they are
 * matched before the plural categories. The compiler used to keep the selector
 * as written and probe `"=" + count`, so `=1.0` and `=01` never matched `n = 1`
 * and the message silently fell through to `one` or `other` instead.
 * RC review #6.
 */
import { describe, expect, it } from "vitest";
import { I18n } from "../helpers/composedHost";

function render(template: string, n: number): string {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { k: template } });
  return i18n.t("k", { n } as never) as string;
}

function ingest(template: string): void {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { k: template } });
}

const WITH_EXACT = (selector: string) =>
  `{n, plural, ${selector} {exact} one {category} other {other}}`;

describe("an exact plural selector", () => {
  it.each([
    ["the canonical form matches", "=1", 1],
    ["a decimal-point form matches the same integer", "=1.0", 1],
    ["a leading zero matches the same integer", "=01", 1],
    ["a trailing-dot form matches the same integer", "=1.", 1],
  ])("%s", (_label, selector, n) => {
    expect(render(WITH_EXACT(selector), n)).toBe("exact");
  });

  it("matches a genuine decimal count", () => {
    expect(render("{n, plural, =1.5 {half past} other {other}}", 1.5)).toBe("half past");
  });

  it("matches a negative count", () => {
    expect(render("{n, plural, =-2 {minus two} other {other}}", -2)).toBe("minus two");
  });

  it("wins over the plural category for the same count", () => {
    expect(render("{n, plural, one {category} =1 {exact} other {other}}", 1)).toBe("exact");
  });

  it("leaves the category to answer a count it does not name", () => {
    expect(render("{n, plural, =0 {none} one {one thing} other {other}}", 1)).toBe("one thing");
  });

  it("is honoured on selectordinal too", () => {
    expect(
      render(
        "{n, plural, =1.0 {exact} one {1st} other {nth}}".replace("plural", "selectordinal"),
        1,
      ),
    ).toBe("exact");
  });
});

describe("an exact plural selector that is not a number", () => {
  it.each([
    ["a word", "=abc"],
    ["a bare equals sign", "="],
    ["a thousands separator", "=1_000"],
    ["a non-finite name", "=Infinity"],
  ])("throws E_ICU_SYNTAX at ingestion for %s", (_label, selector) => {
    expect(() => ingest(WITH_EXACT(selector))).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
  });

  it("names the offending selector in the message", () => {
    expect(() => ingest(WITH_EXACT("=abc"))).toThrow(/=abc/);
  });

  it("names selectordinal as the argument type when that is what failed", () => {
    expect(() => ingest("{n, selectordinal, =abc {x} other {y}}")).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "selectordinal" }),
    );
  });

  it("leaves a select's literal selectors alone", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { k: "{g, select, =abc {odd} other {other}}" } });

    expect(i18n.t("k", { g: "=abc" } as never)).toBe("odd");
  });
});
