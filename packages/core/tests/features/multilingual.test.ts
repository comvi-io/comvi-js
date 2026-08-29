import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedHost";

describe("t() with non-Latin locales", () => {
  it("interpolates params in CJK text without spaces", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({
      jp: { welcome: "ようこそ{name}さん" },
    });

    expect(i18n.t("welcome", { name: "田中", locale: "jp" })).toBe("ようこそ田中さん");
  });

  it.each([
    [0, "لا كتب"],
    [1, "كتاب واحد"],
    [2, "كتابان"],
    [3, "كتب قليلة"],
    [11, "كتب كثيرة"],
    [100, "كتب"],
  ])("selects the Arabic plural branch for count %i", (count, expected) => {
    const i18n = new I18n({ locale: "ar" });
    i18n.addTranslations({
      ar: {
        books:
          "{count, plural, =0 {لا كتب} one {كتاب واحد} two {كتابان} few {كتب قليلة} many {كتب كثيرة} other {كتب}}",
      },
    });

    expect(i18n.t("books", { count })).toBe(expected);
  });
});
