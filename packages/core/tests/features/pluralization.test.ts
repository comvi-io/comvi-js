import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../../src";

describe("Advanced Pluralization Features", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("Standard English Pluralization (one/other)", () => {
    it("should handle singular and plural forms", () => {
      i18n.addTranslations({
        en: {
          apples: "{count, plural, one {one apple} other {# apples}}",
        },
      });

      expect(i18n.t("apples", { count: 1 })).toBe("one apple");
      expect(i18n.t("apples", { count: 0 })).toBe("0 apples");
      expect(i18n.t("apples", { count: 2 })).toBe("2 apples");
      expect(i18n.t("apples", { count: 10 })).toBe("10 apples");
    });

    it("should support exact matches (=0, =1)", () => {
      i18n.addTranslations({
        en: {
          messages: "{count, plural, =0 {No messages} one {1 message} other {# messages}}",
        },
      });

      expect(i18n.t("messages", { count: 0 })).toBe("No messages");
      expect(i18n.t("messages", { count: 1 })).toBe("1 message");
      expect(i18n.t("messages", { count: 5 })).toBe("5 messages");
    });
  });

  describe("Ukrainian Pluralization (one/few/many/other)", () => {
    // Ukrainian Rules:
    // one: ends in 1, excluding 11 (1, 21, 31, 101)
    // few: ends in 2-4, excluding 12-14 (2, 3, 4, 22, 23, 24)
    // many: 0, 5-9, 11-14, etc.
    // other: fractions

    beforeEach(() => {
      i18n = new I18n({ locale: "uk" });
      i18n.addTranslations({
        uk: {
          days: "{count, plural, one {# день} few {# дні} many {# днів} other {# дня}}",
        },
      });
    });

    it("should handle 'one' category (1, 21, 101)", () => {
      expect(i18n.t("days", { count: 1 })).toBe("1 день");
      expect(i18n.t("days", { count: 21 })).toBe("21 день");
      expect(i18n.t("days", { count: 101 })).toBe("101 день");
    });

    it("should handle 'few' category (2-4, 22-24)", () => {
      expect(i18n.t("days", { count: 2 })).toBe("2 дні");
      expect(i18n.t("days", { count: 3 })).toBe("3 дні");
      expect(i18n.t("days", { count: 4 })).toBe("4 дні");
      expect(i18n.t("days", { count: 22 })).toBe("22 дні");
    });

    it("should handle 'many' category (0, 5-9, 11-14)", () => {
      expect(i18n.t("days", { count: 0 })).toBe("0 днів");
      expect(i18n.t("days", { count: 5 })).toBe("5 днів");
      expect(i18n.t("days", { count: 11 })).toBe("11 днів");
      expect(i18n.t("days", { count: 12 })).toBe("12 днів");
      expect(i18n.t("days", { count: 25 })).toBe("25 днів");
    });

    it("should handle 'other' category (fractions in UK)", () => {
      expect(i18n.t("days", { count: 1.5 })).toBe("1.5 дня");
    });
  });

  describe("Plural Formatting Edge Cases", () => {
    it("should handle negative numbers", () => {
      i18n.addTranslations({
        en: {
          change: "{count, plural, =0 {no change} one {# change} other {# changes}}",
        },
      });
      // In English, -1 is "one"
      expect(i18n.t("change", { count: -1 })).toBe("-1 change");
      expect(i18n.t("change", { count: -2 })).toBe("-2 changes");
    });

    it("should allow nested interpolation inside plural options", () => {
      i18n.addTranslations({
        en: {
          found:
            "{count, plural, =0 {No items found in {folder}} other {# items found in {folder}}}",
        },
      });

      expect(i18n.t("found", { count: 0, folder: "Documents" })).toBe(
        "No items found in Documents",
      );
      expect(i18n.t("found", { count: 5, folder: "Downloads" })).toBe("5 items found in Downloads");
    });

    it("treats quoted braces in plural options as literal text", () => {
      i18n.addTranslations({
        en: {
          literal: "{count, plural, one {'{count} literal item'} other {'{count} literal items'}}",
        },
      });

      expect(i18n.t("literal", { count: 1 })).toBe("{count} literal item");
      expect(i18n.t("literal", { count: 3 })).toBe("{count} literal items");
    });
  });
});
