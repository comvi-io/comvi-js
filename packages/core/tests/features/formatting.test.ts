import { describe, it, expect, beforeEach } from "vitest";
import {
  I18n,
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  getTextDirection,
} from "../helpers/composedHost";

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

    it("should keep a bare apostrophe literal unless it precedes a syntax character", () => {
      i18n.addTranslations({
        en: {
          unescapedClock: "o' clock",
          escapedClock: "o'' clock",
          possessive: "Superiors' behavior",
          trailing: "l'",
        },
      });

      expect(i18n.t("unescapedClock")).toBe("o' clock");
      expect(i18n.t("escapedClock")).toBe("o' clock");
      expect(i18n.t("possessive")).toBe("Superiors' behavior");
      expect(i18n.t("trailing")).toBe("l'");
    });

    it("should start quoted text only before {, } or #", () => {
      i18n.addTranslations({
        en: {
          quotedParam: "This is '{not}' a param.",
          quotedBrace: "brace '}' quoted",
          quotedHash: "{count, plural, other {'#' of them: #}}",
        },
      });

      expect(i18n.t("quotedParam", { not: "ignored" })).toBe("This is {not} a param.");
      expect(i18n.t("quotedBrace")).toBe("brace } quoted");
      expect(i18n.t("quotedHash", { count: 3 })).toBe("# of them: 3");
    });

    it("should treat # as syntax only inside plural sub-messages", () => {
      i18n.addTranslations({
        en: {
          topLevel: "Price '#' {amount}",
          topLevelUnterminated: "Price '# {amount}",
          standaloneSelect: "{kind, select, other {Price '#' {amount}}}",
          selectInPlural: "{count, plural, other {{kind, select, other {'#' means the count: #}}}}",
          pluralUnterminated: "{count, plural, other {'# {amount} swallows the closing braces}}",
        },
      });

      expect(i18n.t("topLevel", { amount: 5 })).toBe("Price '#' 5");
      expect(i18n.t("topLevelUnterminated", { amount: 5 })).toBe("Price '# 5");
      expect(i18n.t("standaloneSelect", { kind: "any", amount: 5 })).toBe("Price '#' 5");
      expect(i18n.t("selectInPlural", { count: 3, kind: "any" })).toBe("# means the count: 3");
      // An unterminated quote before # inside a plural swallows the argument's
      // closing braces: the message is malformed ICU (FormatJS throws
      // EXPECT_ARGUMENT_CLOSING_BRACE) and falls back to the raw source.
      expect(i18n.t("pluralUnterminated", { count: 3, amount: 5 })).toBe(
        "{count, plural, other {'# {amount} swallows the closing braces}}",
      );
    });

    it("should keep apostrophes literal inside plural and select branches", () => {
      i18n.addTranslations({
        de: {
          promo:
            "{variant, select, five {Gib' eine Bewertung ab und {company} pflanzt einen Baum!} other {x}}",
          flatBranch: "{g, select, other {Gib' acht}}",
          doubled: "{count, plural, other {It''s # trees}}",
        },
      });
      i18n.locale = "de";

      expect(i18n.t("promo", { variant: "five", company: "ACME" })).toBe(
        "Gib' eine Bewertung ab und ACME pflanzt einen Baum!",
      );
      expect(i18n.t("flatBranch", { g: "any" })).toBe("Gib' acht");
      expect(i18n.t("doubled", { count: 3 })).toBe("It's 3 trees");
    });
  });

  describe("Intl Formatting", () => {
    it("formatNumber: should format a number using current locale", () => {
      expect(formatNumber(i18n, 1234.5)).toBe(new Intl.NumberFormat("en").format(1234.5));
    });

    it("formatNumber: should respect options", () => {
      expect(formatNumber(i18n, 0.75, { style: "percent" })).toBe(
        new Intl.NumberFormat("en", { style: "percent" }).format(0.75),
      );
    });

    it("formatDate: should format a date using current locale", () => {
      const date = new Date(2025, 0, 15);
      expect(formatDate(i18n, date)).toBe(new Intl.DateTimeFormat("en").format(date));
    });

    it("formatDate: should respect options", () => {
      const date = new Date(2025, 0, 15);
      const opts: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "long",
        day: "numeric",
      };
      expect(formatDate(i18n, date, opts)).toBe(new Intl.DateTimeFormat("en", opts).format(date));
    });

    it("formatCurrency: should format currency", () => {
      expect(formatCurrency(i18n, 99.99, "USD")).toBe(
        new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(99.99),
      );
    });

    it("formatCurrency: should respect locale for currency formatting", () => {
      const deI18n = new I18n({ locale: "de" });
      expect(formatCurrency(deI18n, 1234.5, "EUR")).toBe(
        new Intl.NumberFormat("de", { style: "currency", currency: "EUR" }).format(1234.5),
      );
    });

    it("should use locale after locale change", () => {
      i18n.locale = "de";
      expect(formatNumber(i18n, 1234.5)).toBe(new Intl.NumberFormat("de").format(1234.5));
    });

    it("formatRelativeTime: should format past time", () => {
      expect(formatRelativeTime(i18n, -2, "hour")).toBe(
        new Intl.RelativeTimeFormat("en").format(-2, "hour"),
      );
    });

    it("formatRelativeTime: should format future time", () => {
      expect(formatRelativeTime(i18n, 3, "day")).toBe(
        new Intl.RelativeTimeFormat("en").format(3, "day"),
      );
    });

    it("formatRelativeTime: should respect options", () => {
      expect(formatRelativeTime(i18n, -1, "day", { numeric: "auto" })).toBe(
        new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-1, "day"),
      );
    });
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

    it("falls back to 'other' when no match", () => {
      i18n.addTranslations({
        en: {
          msg: "{n, selectordinal, one {first} other {nth}}",
        },
      });
      expect(i18n.t("msg", { n: 100 })).toBe("nth");
    });
  });

  describe("Edge Cases", () => {
    it("should handle quoted empty strings", () => {
      i18n.addTranslations({ en: { empty: "''" } });
      expect(i18n.t("empty")).toBe("'"); // '' -> ' (escaped quote)
    });

    it("should handle empty quote blocks", () => {
      // Template is '{'  — the leading single quote starts a quoted
      // (literal) section, { is treated as literal text, and the trailing
      // single quote ends the quoted section.  Result: {
      i18n.addTranslations({ en: { brace: "'{'" } });
      expect(i18n.t("brace")).toBe("{");
    });
  });
});
