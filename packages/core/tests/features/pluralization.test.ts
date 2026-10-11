import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../helpers/composedInstance";

describe("t() with ICU plural", () => {
  describe("English (one/other)", () => {
    let i18n: I18n;

    beforeEach(() => {
      i18n = new I18n({ locale: "en" });
    });

    it("should handle singular and plural forms", () => {
      i18n.addMessages({
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
      i18n.addMessages({
        en: {
          messages: "{count, plural, =0 {No messages} one {1 message} other {# messages}}",
        },
      });

      expect(i18n.t("messages", { count: 0 })).toBe("No messages");
      expect(i18n.t("messages", { count: 1 })).toBe("1 message");
      expect(i18n.t("messages", { count: 5 })).toBe("5 messages");
    });
  });

  // Why these counts: Ukrainian one = ends in 1 except 11; few = ends in 2-4
  // except 12-14; many = 0, 5-9 and 11-14; other = fractions only.
  describe("Ukrainian (one/few/many/other)", () => {
    let i18n: I18n;

    beforeEach(() => {
      i18n = new I18n({ locale: "uk" });
      i18n.addMessages({
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
      expect(i18n.t("days", { count: 1.5 })).toBe("1,5 дня");
    });
  });

  describe("edge cases", () => {
    let i18n: I18n;

    beforeEach(() => {
      i18n = new I18n({ locale: "en" });
    });

    it("should handle negative numbers", () => {
      i18n.addMessages({
        en: {
          change: "{count, plural, =0 {no change} one {# change} other {# changes}}",
        },
      });

      expect(i18n.t("change", { count: -1 })).toBe("-1 change");
      expect(i18n.t("change", { count: -2 })).toBe("-2 changes");
    });

    it("should allow nested interpolation inside plural options", () => {
      i18n.addMessages({
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

    it("renders empty when no category matches and there is no other branch", () => {
      i18n.addMessages({
        en: {
          partial: "{count, plural, one {# one}}",
        },
      });

      expect(i18n.t("partial", { count: 1 })).toBe("1 one");
      expect(i18n.t("partial", { count: 5 })).toBe("");
    });

    it("ignores a branch named after an unknown plural category", () => {
      i18n.addMessages({
        en: {
          bogus: "{count, plural, quux {# quux} other {# other}}",
        },
      });

      expect(i18n.t("bogus", { count: 3 })).toBe("3 other");
    });

    it("treats quoted braces in plural options as literal text", () => {
      i18n.addMessages({
        en: {
          literal: "{count, plural, one {'{count} literal item'} other {'{count} literal items'}}",
        },
      });

      expect(i18n.t("literal", { count: 1 })).toBe("{count} literal item");
      expect(i18n.t("literal", { count: 3 })).toBe("{count} literal items");
    });
  });

  describe("nested plurals", () => {
    let i18n: I18n;

    beforeEach(() => {
      i18n = new I18n({ locale: "en" });
    });

    it("binds # to the nearest enclosing plural, not the outer one", () => {
      i18n.addMessages({
        en: {
          msg:
            "{files, plural, " +
            "one {one file in {folders, plural, one {one folder} other {# folders}}} " +
            "other {# files in {folders, plural, one {one folder} other {# folders}}}}",
        },
      });

      expect(i18n.t("msg", { files: 1, folders: 1 })).toBe("one file in one folder");
      expect(i18n.t("msg", { files: 1, folders: 5 })).toBe("one file in 5 folders");
      expect(i18n.t("msg", { files: 3, folders: 1 })).toBe("3 files in one folder");
      // Regression: inner # must use folders (5), not files (3).
      expect(i18n.t("msg", { files: 3, folders: 5 })).toBe("3 files in 5 folders");
    });

    it("does not replace a quoted # with the count", () => {
      i18n.addMessages({
        en: {
          // The interpolation forces the branch through the template processor,
          // which is what unwraps the quoted literal.
          price: "{count, plural, other {'#'# {label}}}",
        },
      });

      expect(i18n.t("price", { count: 7, label: "items" })).toBe("#7 items");
    });

    it("keeps # bound to the enclosing plural inside a nested select", () => {
      i18n.addMessages({
        en: {
          msg:
            "{count, plural, " +
            "one {{gender, select, male {he has one file} other {they have one file}}} " +
            "other {{gender, select, male {he has # files} other {they have # files}}}}",
        },
      });

      expect(i18n.t("msg", { count: 3, gender: "male" })).toBe("he has 3 files");
      expect(i18n.t("msg", { count: 3, gender: "female" })).toBe("they have 3 files");
    });

    it("rebinds # only for a plural nested inside a select inside a plural", () => {
      i18n.addMessages({
        en: {
          msg:
            "{files, plural, other {{gender, select, " +
            "other {{folders, plural, other {# folders}} and # files}}}}",
        },
      });

      expect(i18n.t("msg", { files: 3, folders: 5, gender: "x" })).toBe("5 folders and 3 files");
    });
  });
});

describe("`#` is formatted for the locale (ICU MessageFormat semantics)", () => {
  const nf = (locale: string, n: number) => new Intl.NumberFormat(locale).format(n);

  it("groups digits the way the message locale does", () => {
    const en = new I18n({ locale: "en" });
    en.addMessages({ en: { items: "{count, plural, one {# item} other {# items}}" } });
    expect(en.t("items", { count: 1234 })).toBe("1,234 items");
    expect(en.t("items", { count: 1234567 })).toBe("1,234,567 items");
    expect(en.t("items", { count: 12 })).toBe("12 items");

    const de = new I18n({ locale: "de" });
    de.addMessages({ de: { items: "{count, plural, one {# Artikel} other {# Artikel}}" } });
    expect(de.t("items", { count: 1234 })).toBe("1.234 Artikel");

    const uk = new I18n({ locale: "uk" });
    uk.addMessages({
      uk: {
        items: "{count, plural, one {# товар} few {# товари} many {# товарів} other {# товару}}",
      },
    });
    expect(uk.t("items", { count: 1234 })).toBe(`${nf("uk", 1234)} товари`);
  });

  it("formats a fractional count and keeps exact-match selectors on the number", () => {
    const en = new I18n({ locale: "en" });
    en.addMessages({
      en: {
        items: "{count, plural, =1000 {exactly a thousand} other {# items}}",
        km: "{count, plural, one {# kilometer} other {# kilometers}}",
      },
    });
    expect(en.t("items", { count: 1000 })).toBe("exactly a thousand");
    expect(en.t("items", { count: 1001 })).toBe("1,001 items");
    expect(en.t("km", { count: 1234.5 })).toBe("1,234.5 kilometers");
  });

  it("applies to `#` inside a branch that is re-parsed, and to selectordinal", () => {
    const en = new I18n({ locale: "en" });
    en.addMessages({
      en: {
        inbox: "{count, plural, one {# message for {name}} other {# messages for {name}}}",
        place: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
      },
    });
    expect(en.t("inbox", { count: 2500, name: "Ann" })).toBe("2,500 messages for Ann");
    expect(en.t("place", { n: 1001 })).toBe("1,001st");
  });

  it("leaves `{count}` as the raw value and a quoted '#' as a literal", () => {
    const en = new I18n({ locale: "en" });
    en.addMessages({
      en: {
        raw: "{count, plural, other {{count} items}}",
        literal: "{count, plural, other {'#' is # }}",
      },
    });
    expect(en.t("raw", { count: 1234 })).toBe("1234 items");
    expect(en.t("literal", { count: 1234 })).toBe("# is 1,234 ");
  });

  it("keeps the sign of negative zero, like Intl", () => {
    const en = new I18n({ locale: "en" });
    en.addMessages({ en: { items: "{count, plural, other {# items}}" } });
    expect(en.t("items", { count: -0 })).toBe(`${nf("en", -0)} items`);
    expect(en.t("items", { count: -0 })).toBe("-0 items");
    expect(en.t("items", { count: 0 })).toBe("0 items");
  });

  it("uses the locale's digits and minus sign below the plain-integer range", () => {
    const eg = new I18n({ locale: "ar-EG" });
    eg.addMessages({ "ar-EG": { items: "{count, plural, other {# items}}" } });
    expect(eg.t("items", { count: 5 })).toBe(`${nf("ar-EG", 5)} items`);

    const sv = new I18n({ locale: "sv" });
    sv.addMessages({ sv: { items: "{count, plural, other {# items}}" } });
    expect(sv.t("items", { count: -5 })).toBe(`${nf("sv", -5)} items`);
  });

  it("groups integers at and beyond +-1000", () => {
    const en = new I18n({ locale: "en" });
    en.addMessages({ en: { items: "{count, plural, other {# items}}" } });
    expect(en.t("items", { count: 1000 })).toBe("1,000 items");
    expect(en.t("items", { count: -1000 })).toBe(`${nf("en", -1000)} items`);
    expect(en.t("items", { count: -1234 })).toBe(`${nf("en", -1234)} items`);
    expect(en.t("items", { count: -999 })).toBe("-999 items");
  });

  it("falls back to the runtime default locale for an invalid locale tag", () => {
    const odd = new I18n({ locale: "not a locale" });
    odd.addMessages({ "not a locale": { items: "{count, plural, other {# items}}" } });
    expect(odd.t("items", { count: 1234 })).toBe(
      `${new Intl.NumberFormat(undefined).format(1234)} items`,
    );
  });
});
