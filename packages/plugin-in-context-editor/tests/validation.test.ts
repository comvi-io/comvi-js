import { describe, expect, it } from "vitest";
import type { Language, PluralFormTranslation } from "../src/types";
import { validateField, validateTranslations } from "../src/utils/validation";

const LANGUAGES: Language[] = [
  {
    id: 1,
    code: "en",
    name: "English",
    nativeName: "English",
    pluralForms: ["one", "other"],
    isSource: true,
  },
  {
    id: 2,
    code: "uk",
    name: "Ukrainian",
    nativeName: "Українська",
    pluralForms: ["one", "few", "many", "other"],
    isSource: false,
  },
];

describe("validation utilities", () => {
  it("reports errors when plural form values exceed max length", () => {
    const veryLongValue = "x".repeat(5001);
    const translations: Record<string, PluralFormTranslation> = {
      en: { one: veryLongValue, other: "ok" },
      uk: { few: veryLongValue, other: "ok" },
    };

    const result = validateTranslations(LANGUAGES, translations);

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.languageId).toBe("en");
    expect(result.errors[1]?.languageId).toBe("uk");
  });

  it("allows empty and missing plural forms", () => {
    const translations: Record<string, PluralFormTranslation> = {
      en: {},
      uk: { other: "" },
    };

    const result = validateTranslations(LANGUAGES, translations);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates required field rule", () => {
    expect(validateField("", true)).toBe("This field is required");
    expect(validateField("   ", true)).toBe("This field is required");
  });

  it("validates max field length rule", () => {
    expect(validateField("x".repeat(5001))).toBe(
      "Translation exceeds maximum length of 5000 characters",
    );
    expect(validateField("Valid value")).toBeNull();
  });
});
