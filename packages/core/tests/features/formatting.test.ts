import { describe, it, expect, beforeEach } from "vitest";
import { I18n, getTextDirection, type TranslationParams } from "../helpers/composedHost";

describe("ICU message formatting and the Intl helpers", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("Quoting", () => {
    it("should escape special characters using single quotes", () => {
      i18n.addTranslations({
        en: {
          literal: "This is '{not}' a param.",
        },
      });
      expect(i18n.t("literal", { not: "ignored" })).toBe("This is {not} a param.");
    });

    it("should escape double single quotes as a literal single quote", () => {
      i18n.addTranslations({
        en: {
          possession: "It''s a beautiful day.",
        },
      });
      expect(i18n.t("possession")).toBe("It's a beautiful day.");
    });

    it("should render quoted templates identically on repeated calls", () => {
      i18n.addTranslations({
        en: {
          literal: "Fully '{quoted}' message with no params.",
        },
      });

      const first = i18n.t("literal");
      const second = i18n.t("literal");
      expect(first).toBe("Fully {quoted} message with no params.");
      expect(second).toBe(first);
    });

    it("should handle complex quoting in CJK text", () => {
      i18n.addTranslations({
        ja: {
          msg: "愛 '{param}' 愛",
        },
      });
      i18n.locale = "ja";
      expect(i18n.t("msg", { param: "Love" })).toBe("愛 {param} 愛");
    });

    it("renders a doubled quote alone as one literal quote", () => {
      i18n.addTranslations({ en: { empty: "''" } });

      expect(i18n.t("empty")).toBe("'");
    });

    it("renders a quote-brace-quote template as one literal brace", () => {
      // '{' — the leading quote opens a literal section, { is literal text, and
      // the trailing quote closes the section.
      i18n.addTranslations({ en: { brace: "'{'" } });

      expect(i18n.t("brace")).toBe("{");
    });
  });

  describe("Apostrophes (ICU DOUBLE_OPTIONAL)", () => {
    it("should treat apostrophes inside words as literal text (French)", () => {
      i18n.addTranslations({
        fr: {
          summer: "C'est l'été",
        },
      });
      i18n.locale = "fr";
      expect(i18n.t("summer")).toBe("C'est l'été");
    });

    it("should treat apostrophes inside words as literal text (English)", () => {
      i18n.addTranslations({
        en: {
          cant: "I can't do that.",
        },
      });
      expect(i18n.t("cant")).toBe("I can't do that.");
    });

    it("should treat apostrophes inside words as literal text (Hebrew)", () => {
      i18n.addTranslations({
        he: {
          geresh: "ג'מוס",
        },
      });
      i18n.locale = "he";
      expect(i18n.t("geresh")).toBe("ג'מוס");
    });

    it.each([
      ["a bare apostrophe before a space", "o' clock", "o' clock"],
      ["a doubled apostrophe before a space", "o'' clock", "o' clock"],
      ["a possessive apostrophe after a word", "Superiors' behavior", "Superiors' behavior"],
      ["an apostrophe at the end of the template", "l'", "l'"],
    ])(
      "should keep an apostrophe literal unless it precedes a syntax character: %s",
      (_label, template, expected) => {
        i18n.addTranslations({ en: { msg: template } });

        expect(i18n.t("msg")).toBe(expected);
      },
    );

    it.each<[string, string, TranslationParams, string]>([
      ["a quoted param", "This is '{not}' a param.", { not: "ignored" }, "This is {not} a param."],
      ["a quoted closing brace", "brace '}' quoted", {}, "brace } quoted"],
      [
        "a quoted hash inside a plural",
        "{count, plural, other {'#' of them: #}}",
        { count: 3 },
        "# of them: 3",
      ],
    ])(
      "should start quoted text only before {, } or #: %s",
      (_label, template, params, expected) => {
        i18n.addTranslations({ en: { msg: template } });

        expect(i18n.t("msg", params)).toBe(expected);
      },
    );

    it.each<[string, string, TranslationParams, string]>([
      ["at the top level", "Price '#' {amount}", { amount: 5 }, "Price '#' 5"],
      ["at the top level, unterminated", "Price '# {amount}", { amount: 5 }, "Price '# 5"],
      [
        "inside a standalone select",
        "{kind, select, other {Price '#' {amount}}}",
        { kind: "any", amount: 5 },
        "Price '#' 5",
      ],
      [
        "inside a select nested in a plural",
        "{count, plural, other {{kind, select, other {'#' means the count: #}}}}",
        { count: 3, kind: "any" },
        "# means the count: 3",
      ],
      [
        // An unterminated quote before # inside a plural swallows the argument's
        // closing braces: the message is malformed ICU (FormatJS throws
        // EXPECT_ARGUMENT_CLOSING_BRACE) and falls back to the raw source.
        "unterminated inside a plural, swallowing the closing braces",
        "{count, plural, other {'# {amount} swallows the closing braces}}",
        { count: 3, amount: 5 },
        "{count, plural, other {'# {amount} swallows the closing braces}}",
      ],
    ])(
      "should treat # as syntax only inside plural sub-messages: %s",
      (_label, template, params, expected) => {
        i18n.addTranslations({ en: { msg: template } });

        expect(i18n.t("msg", params)).toBe(expected);
      },
    );

    it.each<[string, string, TranslationParams, string]>([
      [
        "a select branch with other params",
        "{variant, select, five {Gib' eine Bewertung ab und {company} pflanzt einen Baum!} other {x}}",
        { variant: "five", company: "ACME" },
        "Gib' eine Bewertung ab und ACME pflanzt einen Baum!",
      ],
      ["a flat select branch", "{g, select, other {Gib' acht}}", { g: "any" }, "Gib' acht"],
      [
        "a doubled apostrophe in a plural branch",
        "{count, plural, other {It''s # trees}}",
        { count: 3 },
        "It's 3 trees",
      ],
    ])(
      "should keep apostrophes literal inside plural and select branches: %s",
      (_label, template, params, expected) => {
        i18n.addTranslations({ de: { msg: template } });
        i18n.locale = "de";

        expect(i18n.t("msg", params)).toBe(expected);
      },
    );
  });

  describe("getTextDirection()", () => {
    // The base language decides, except where a script subtag overrides it; an
    // unrecognised tag falls back to "ltr" rather than throwing.
    it.each([
      ["en", "ltr"],
      ["ar", "rtl"],
      ["he-IL", "rtl"],
      ["fa", "rtl"],
      ["ur", "rtl"],
      ["ckb", "rtl"],
      ["ku-Arab", "rtl"],
      ["ku-Latn", "ltr"],
      ["uz-Arab", "rtl"],
      ["uz-Latn", "ltr"],
      ["ks-Deva", "ltr"],
      ["sd-Deva", "ltr"],
      ["ar-Latn", "ltr"],
      ["not-a-real-locale", "ltr"],
      ["xyz", "ltr"],
    ])('getTextDirection("%s") → %s', (tag, expected) => {
      expect(getTextDirection(tag)).toBe(expected);
    });
  });

  describe("selectordinal", () => {
    it.each([
      [1, "1st"],
      [2, "2nd"],
      [3, "3rd"],
      [4, "4th"],
      [21, "21st"],
    ])("formats English ordinal %i as %s", (place, ordinal) => {
      i18n.addTranslations({
        en: {
          rank: "You are {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} place",
        },
      });

      expect(i18n.t("rank", { place })).toBe(`You are ${ordinal} place`);
    });

    it("selects the 'other' branch for a count no keyword matches", () => {
      i18n.addTranslations({
        en: {
          msg: "{n, selectordinal, one {first} other {nth}}",
        },
      });

      expect(i18n.t("msg", { n: 100 })).toBe("nth");
    });
  });
});
