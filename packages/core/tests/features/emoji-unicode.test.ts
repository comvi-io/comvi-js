import { describe, it, expect } from "vitest";
import { createI18n } from "../helpers/composedInstance";
import type { TagCallbackParams, TranslationParams } from "../../src/types";

/**
 * Emoji and other text outside the Basic Multilingual Plane, in every
 * position a message has. The parser scans UTF-16 code units and every syntax
 * character is ASCII, so the claim under test is that a surrogate pair, a ZWJ
 * sequence or a skin-tone modifier is never split and never mistaken for
 * syntax — next to a brace, inside a branch, inside a tag.
 */

function render(template: string, params?: TranslationParams): string {
  const i18n = createI18n({ locale: "en", messages: { en: { msg: template } } });
  return i18n.t("msg", params);
}

describe("t() with emoji and non-BMP text", () => {
  it("emoji in plain text → returned unchanged", () => {
    const rendered = render("Saved 🎉 — 👨‍👩‍👧‍👦 שלום 👍🏽");

    expect(rendered).toBe("Saved 🎉 — 👨‍👩‍👧‍👦 שלום 👍🏽");
  });

  it("emoji in a parameter value → interpolated whole", () => {
    const rendered = render("Hi {name}!", { name: "👩🏽‍💻 Zoë" });

    expect(rendered).toBe("Hi 👩🏽‍💻 Zoë!");
  });

  it("a surrogate pair touching both braces of a parameter → neither half is lost", () => {
    const rendered = render("😀{name}😀", { name: "Ada" });

    expect(rendered).toBe("😀Ada😀");
  });

  it("emoji inside a plural branch → the chosen branch with its emoji", () => {
    const rendered = render("{count, plural, one {# 🍎} other {# 🍎🍏}}", { count: 2 });

    expect(rendered).toBe("2 🍎🍏");
  });

  it("an emoji as a select selector → matched by the parameter value", () => {
    const rendered = render("{mood, select, 😀 {Glad 😀} other {Hm 🤔}}", { mood: "😀" });

    expect(rendered).toBe("Glad 😀");
  });

  it("emoji inside a tag → the handler receives it as children", () => {
    const rendered = render("Tap <b>👍🏽 here</b> 🎉", {
      b: ({ children }: TagCallbackParams) => `[${children}]`,
    });

    expect(rendered).toBe("Tap [👍🏽 here] 🎉");
  });

  it("a lone surrogate next to a parameter → passed through as written", () => {
    const rendered = render("\ud83d{name}\ude00", { name: "Ada" });

    expect(rendered).toBe("\ud83dAda\ude00");
  });
});
