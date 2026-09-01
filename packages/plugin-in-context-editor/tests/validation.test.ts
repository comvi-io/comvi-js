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

describe("validateTranslations()", () => {
  it("reports errors when plural form values exceed max length", () => {
    const veryLongValue = "x".repeat(5001);
    const translations: Record<string, PluralFormTranslation> = {
      en: { one: veryLongValue, other: "ok" },
      uk: { few: veryLongValue, other: "ok" },
    };

    const result = validateTranslations(LANGUAGES, translations);

    expect(result).toEqual({
      isValid: false,
      errors: [
        {
          languageId: "en",
          pluralForm: "one",
          message: 'Translation for "one" form exceeds maximum length of 5000 characters',
        },
        {
          languageId: "uk",
          pluralForm: "few",
          message: 'Translation for "few" form exceeds maximum length of 5000 characters',
        },
      ],
    });
  });

  it("accepts a value of exactly the 5000-character maximum", () => {
    const translations: Record<string, PluralFormTranslation> = {
      en: { other: "x".repeat(5000) },
    };

    const result = validateTranslations(LANGUAGES, translations);

    expect(result).toEqual({ isValid: true, errors: [] });
  });

  it("allows empty and missing plural forms", () => {
    const translations: Record<string, PluralFormTranslation> = {
      en: {},
      uk: { other: "" },
    };

    const result = validateTranslations(LANGUAGES, translations);

    expect(result).toEqual({ isValid: true, errors: [] });
  });
});

describe("validateField()", () => {
  it.each([
    ["", "empty string"],
    ["   ", "whitespace only"],
  ])('validateField(%j, true) → "This field is required" (%s)', (value) => {
    expect(validateField(value, true)).toBe("This field is required");
  });

  it("a required field with a value → no error", () => {
    expect(validateField("Valid value", true)).toBeNull();
  });

  it("a value within the limit and not required → no error", () => {
    expect(validateField("Valid value")).toBeNull();
  });

  it("an empty value that is not required → no error", () => {
    expect(validateField("")).toBeNull();
  });

  it("a value longer than 5000 characters → the max-length error", () => {
    expect(validateField("x".repeat(5001))).toBe(
      "Translation exceeds maximum length of 5000 characters",
    );
  });

  it("a value of exactly 5000 characters → no error", () => {
    expect(validateField("x".repeat(5000))).toBeNull();
  });
});

describe("validateTranslations — placeholder warnings", () => {
  const lang = { code: "de", name: "German", pluralForms: ["one", "other"] } as never;

  it("warns when a form's placeholders differ from the first form → names the missing and unexpected ones", () => {
    const result = validateTranslations([lang], {
      de: { one: "Hallo {name}", other: "Hallo {nom}" },
    });

    expect(result.warnings).toEqual([
      {
        languageId: "de",
        pluralForm: "other",
        message: "Placeholders differ from the first form; missing: name; unexpected: nom",
      },
    ]);
  });

  it("a placeholder mismatch stays non-blocking → isValid remains true and errors stay empty", () => {
    const result = validateTranslations([lang], {
      de: { one: "Hallo {name}", other: "Hallo" },
    });

    expect(result).toEqual({
      isValid: true,
      errors: [],
      warnings: [
        {
          languageId: "de",
          pluralForm: "other",
          message: "Placeholders differ from the first form; missing: name",
        },
      ],
    });
  });

  it("matching placeholders across forms → no warnings", () => {
    const result = validateTranslations([lang], {
      de: { one: "Hallo {name}", other: "Hi {name}" },
    });

    expect(result.warnings).toEqual([]);
  });
});
