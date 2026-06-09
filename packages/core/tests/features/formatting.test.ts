import { describe, it, expect, beforeEach } from "vitest";
import {
  I18n,
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  getTextDirection,
} from "../../src";

describe("Advanced Formatting (Quoting & Escaping)", () => {
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

    it("should handle complex quoting in CJK text", () => {
      i18n.addTranslations({
        jp: {
          msg: "愛 '{param}' 愛",
        },
      });
      i18n.locale = "jp";
      expect(i18n.t("msg", { param: "Love" })).toBe("愛 {param} 愛");
    });
  });

  describe("Smart Apostrophes (Language Aware)", () => {
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

    it("should require doubled apostrophe when apostrophe is not between word characters", () => {
      i18n.addTranslations({
        en: {
          unescapedClock: "o' clock",
          escapedClock: "o'' clock",
        },
      });

      expect(i18n.t("unescapedClock")).toBe("o clock");
      expect(i18n.t("escapedClock")).toBe("o' clock");
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

  describe("Text direction", () => {
    it("returns 'ltr' for English", () => {
      expect(getTextDirection("en")).toBe("ltr");
    });

    it("returns 'rtl' for Arabic", () => {
      expect(getTextDirection("ar")).toBe("rtl");
    });

    it("returns 'rtl' for Hebrew with region", () => {
      expect(getTextDirection("he-IL")).toBe("rtl");
    });

    it("returns 'rtl' for Persian, Urdu", () => {
      expect(getTextDirection("fa")).toBe("rtl");
      expect(getTextDirection("ur")).toBe("rtl");
    });

    it("returns 'rtl' for Central Kurdish (Sorani)", () => {
      expect(getTextDirection("ckb")).toBe("rtl");
    });

    it("handles script subtags: Kurdish in Arabic script is rtl", () => {
      expect(getTextDirection("ku-Arab")).toBe("rtl");
    });

    it("handles script subtags: Kurdish in Latin script is ltr", () => {
      expect(getTextDirection("ku-Latn")).toBe("ltr");
    });

    it("handles script subtags: Uzbek in Arabic script is rtl", () => {
      expect(getTextDirection("uz-Arab")).toBe("rtl");
    });

    it("handles script subtags: Uzbek in Latin script is ltr", () => {
      expect(getTextDirection("uz-Latn")).toBe("ltr");
    });

    it("handles script subtags: Kashmiri in Devanagari is ltr", () => {
      expect(getTextDirection("ks-Deva")).toBe("ltr");
    });

    it("handles script subtags: Sindhi in Devanagari is ltr", () => {
      expect(getTextDirection("sd-Deva")).toBe("ltr");
    });

    it("handles script subtags: Arabic transliterated in Latin is ltr", () => {
      expect(getTextDirection("ar-Latn")).toBe("ltr");
    });

    it("falls back to 'ltr' for invalid locales without throwing", () => {
      expect(() => getTextDirection("not-a-real-locale")).not.toThrow();
      expect(getTextDirection("xyz")).toBe("ltr");
    });

    it("updates when locale changes", () => {
      const instance = new I18n({ locale: "en" });
      expect(getTextDirection(instance.locale)).toBe("ltr");
      instance.locale = "ar";
      expect(getTextDirection(instance.locale)).toBe("rtl");
      instance.locale = "ku-Arab";
      expect(getTextDirection(instance.locale)).toBe("rtl");
    });
  });

  describe("selectordinal", () => {
    it("formats English ordinals", () => {
      i18n.addTranslations({
        en: {
          rank: "You are {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} place",
        },
      });
      expect(i18n.t("rank", { place: 1 })).toBe("You are 1st place");
      expect(i18n.t("rank", { place: 2 })).toBe("You are 2nd place");
      expect(i18n.t("rank", { place: 3 })).toBe("You are 3rd place");
      expect(i18n.t("rank", { place: 4 })).toBe("You are 4th place");
      expect(i18n.t("rank", { place: 21 })).toBe("You are 21st place");
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
