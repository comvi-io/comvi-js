import { describe, it, expect } from "vitest";
import { I18n } from "../../src";

describe("Multilingual Support", () => {
  it("interpolates params in CJK text without spaces", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      jp: { welcome: "ようこそ{name}さん" },
    });

    expect(i18n.t("welcome", { name: "田中", locale: "jp" })).toBe("ようこそ田中さん");
  });

  it("handles plural rules with many categories (Arabic)", () => {
    const i18n = new I18n({ locale: "ar" });
    i18n.addTranslations({
      ar: {
        books:
          "{count, plural, =0 {لا كتب} one {كتاب واحد} two {كتابان} few {كتب قليلة} many {كتب كثيرة} other {كتب}}",
      },
    });

    expect(i18n.t("books", { count: 0 })).toBe("لا كتب");
    expect(i18n.t("books", { count: 1 })).toBe("كتاب واحد");
    expect(i18n.t("books", { count: 2 })).toBe("كتابان");
    expect(i18n.t("books", { count: 3 })).toBe("كتب قليلة");
    expect(i18n.t("books", { count: 11 })).toBe("كتب كثيرة");
    expect(i18n.t("books", { count: 100 })).toBe("كتب");
  });
});
