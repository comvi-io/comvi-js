import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

type PluralRulesModule = typeof import("../src/composables/usePluralRules");

/**
 * The module classifies a fixed probe set of numbers to discover a language's
 * categories, so for english every probed number lands in `one` or `other`.
 */
const ENGLISH_EXAMPLES = {
  one: [1],
  other: [
    0, 0.1, 0.5, 0.9, 1.1, 1.5, 1.9, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
    42, 43, 44, 45, 46, 47, 48, 49, 50, 60, 70, 80, 90, 100, 101, 102, 103, 104, 105, 106, 107, 108,
    109, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 10000, 100000, 1000000, 2000000,
  ],
};

const LOCALE_RULES: Array<{
  locale: string;
  categories: string[];
  explanations: Record<string, string>;
}> = [
  {
    locale: "cy",
    categories: ["zero", "one", "two", "few", "many", "other"],
    explanations: {
      zero: "Used when count is exactly 0",
      one: "Used when count is exactly 1",
      two: "Used when count is exactly 2",
      few: "Used for specific numbers",
      many: "Used for specific numbers",
      other: "Used for numbers not covered by other forms",
    },
  },
  {
    locale: "ru",
    categories: ["one", "few", "many", "other"],
    explanations: {
      one: "Used for numbers ending in 1 (except those ending in 11)",
      few: "Used for numbers ending in 2-4 (except those ending in 12-14)",
      many: "Used for numbers ending in 0 or 5-9, and numbers ending in 11-14",
      other: "Used for numbers not covered by other forms",
    },
  },
  {
    locale: "fr",
    categories: ["one", "many", "other"],
    explanations: {
      one: "Used when count is 0-1 inclusive (including decimals between 0-1)",
      many: "Used for integers ≥ 1,000,000 (one million or greater)",
      other: "Used for numbers not covered by other forms",
    },
  },
  {
    locale: "ar-EG",
    categories: ["zero", "one", "two", "few", "many", "other"],
    explanations: {
      zero: "Used when count is exactly 0",
      one: "Used when count is exactly 1",
      two: "Used when count is exactly 2",
      few: "Used for numbers 3-10",
      many: "Used for specific numbers",
      other: "Used for numbers not covered by other forms",
    },
  },
  {
    locale: "he",
    categories: ["one", "two", "other"],
    explanations: {
      one: "Used when count is 1 or a decimal between 0-1",
      two: "Used when count is exactly 2",
      other: "Used for specific numbers",
    },
  },
  {
    locale: "ja",
    categories: ["other"],
    explanations: {
      other: "Used for all numbers (this language doesn't have distinct plural forms)",
    },
  },
  {
    locale: "br",
    categories: ["one", "two", "few", "many", "other"],
    explanations: {
      one: "Used for numbers ending in 1 (except those ending in 11)",
      two: "Used for specific numbers",
      few: "Used for specific numbers",
      many: "Used for integers ≥ 1,000,000 (one million or greater)",
      other: "Used for numbers not covered by other forms",
    },
  },
  {
    locale: "lv",
    categories: ["zero", "one", "other"],
    explanations: {
      zero: "Used for specific numbers",
      one: "Used when count is 1 or a decimal between 0-1",
      other: "Used for specific numbers",
    },
  },
  {
    locale: "ro",
    categories: ["one", "few", "other"],
    explanations: {
      one: "Used when count is exactly 1",
      few: "Used for specific numbers",
      other: "Used for specific numbers",
    },
  },
  {
    locale: "ak",
    categories: ["one", "other"],
    explanations: {
      one: "Used for specific numbers",
      other: "Used for all values except those in 'one' category",
    },
  },
  {
    locale: "hi",
    categories: ["one", "other"],
    explanations: {
      one: "Used for specific numbers",
      other: "Used for all values except those in 'one' category",
    },
  },
  {
    locale: "gd",
    categories: ["one", "two", "few", "other"],
    explanations: {
      one: "Used for specific numbers",
      two: "Used when count is exactly 2",
      few: "Used for specific numbers",
      other: "Used for specific numbers",
    },
  },
];

const LOCALE_EXAMPLES: Array<{ locale: string; category: string; examples: number[] }> = [
  { locale: "cy", category: "zero", examples: [0] },
  { locale: "cy", category: "two", examples: [2] },
  { locale: "cy", category: "many", examples: [6] },
  { locale: "ru", category: "one", examples: [1, 21, 31, 41, 101] },
  {
    locale: "ru",
    category: "few",
    examples: [2, 3, 4, 22, 23, 24, 32, 33, 34, 42, 43, 44, 102, 103, 104],
  },
  { locale: "ru", category: "other", examples: [0.1, 0.5, 0.9, 1.1, 1.5, 1.9, 2.5] },
  { locale: "fr", category: "one", examples: [0, 0.1, 0.5, 0.9, 1, 1.1, 1.5, 1.9] },
  { locale: "fr", category: "many", examples: [1000000, 2000000] },
  {
    locale: "ar-EG",
    category: "few",
    examples: [3, 4, 5, 6, 7, 8, 9, 10, 103, 104, 105, 106, 107, 108, 109],
  },
  { locale: "he", category: "one", examples: [0.1, 0.5, 0.9, 1] },
  { locale: "ak", category: "one", examples: [0, 1] },
  { locale: "hi", category: "one", examples: [0, 0.1, 0.5, 0.9, 1] },
  { locale: "gd", category: "two", examples: [2, 12] },
];

let errorSpy: MockInstance<typeof console.error>;
let detectPluralCategories: PluralRulesModule["detectPluralCategories"];
let getPluralCategory: PluralRulesModule["getPluralCategory"];
let usePluralRules: PluralRulesModule["usePluralRules"];

/**
 * Every test analyses its locales through a freshly evaluated module: the
 * analysis is memoised per language code in a module-level cache with no reset
 * export, so a locale another test already looked up would otherwise be
 * answered from that cache without the analysis under test ever running.
 */
beforeEach(async () => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.resetModules();
  ({ detectPluralCategories, getPluralCategory, usePluralRules } =
    await import("../src/composables/usePluralRules"));
});

describe("usePluralRules()", () => {
  it("returns the same object for the same language code (documented memo)", () => {
    const first = usePluralRules("en");
    const second = usePluralRules("en");

    expect(second).toBe(first);
  });

  it("provides deterministic english explanations and examples", () => {
    const result = usePluralRules("en");

    expect(result.categories).toEqual(["one", "other"]);
    expect(result.explanations).toEqual({
      one: "Used when count is exactly 1",
      other: "Used for all values except those in 'one' category",
    });
    expect(result.examples.one).toEqual([1]);
  });

  it("classifies every probed number into exactly one english category", () => {
    const result = usePluralRules("en");

    expect(result.examples).toEqual(ENGLISH_EXAMPLES);
  });

  it.each(LOCALE_RULES)(
    "describes the plural forms of $locale",
    ({ locale, categories, explanations }) => {
      const result = usePluralRules(locale);

      expect(result.categories).toEqual(categories);
      expect(result.explanations).toEqual(explanations);
    },
  );

  it.each(LOCALE_EXAMPLES)(
    "lists the $category examples of $locale",
    ({ locale, category, examples }) => {
      const result = usePluralRules(locale);

      expect(result.examples[category]).toEqual(examples);
    },
  );

  it("normalizes underscore locales before analysing them", () => {
    const result = usePluralRules("ar_EG");

    expect(result.categories).toEqual(["zero", "one", "two", "few", "many", "other"]);
    expect(result.explanations.few).toBe("Used for numbers 3-10");
  });

  it("returns fallback rules when Intl.PluralRules is unavailable", () => {
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw new Error("Unsupported locale");
    });

    const result = usePluralRules("zz-ZZ");

    expect(result).toEqual({
      categories: ["other"],
      explanations: {
        other: "Used for all numbers (unable to analyze rules for this language)",
      },
      examples: { other: [0, 1, 2, 3, 5, 10] },
    });
  });

  it("memoises the fallback so a failing language is analysed and reported once", () => {
    const failure = new Error("Unsupported locale");
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw failure;
    });

    const first = usePluralRules("zz-CACHED");
    const second = usePluralRules("zz-CACHED");

    expect(second).toBe(first);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("Error categorizing numbers:", failure);
  });
});

describe("detectPluralCategories()", () => {
  it("normalizes underscore locales when detecting categories", () => {
    expect(detectPluralCategories("en_US")).toEqual(["one", "other"]);
  });

  it.each([
    { locale: "cy", categories: ["zero", "one", "two", "few", "many", "other"] },
    { locale: "ru", categories: ["one", "few", "many", "other"] },
    { locale: "ja", categories: ["other"] },
  ])("orders the categories of $locale from zero to other", ({ locale, categories }) => {
    expect(detectPluralCategories(locale)).toEqual(categories);
  });

  it("falls back to a single other category when Intl.PluralRules is unavailable", () => {
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw new Error("Unsupported locale");
    });

    expect(detectPluralCategories("zy-YY")).toEqual(["other"]);
  });
});

describe("getPluralCategory()", () => {
  it.each([
    [1, "one"],
    [0, "other"],
    [2, "other"],
  ])("classifies %i as %s in english", (count, expected) => {
    expect(getPluralCategory(count, "en")).toBe(expected);
  });

  it.each([
    { locale: "ru", count: 1, category: "one" },
    { locale: "ru", count: 2, category: "few" },
    { locale: "ru", count: 11, category: "many" },
    { locale: "ru", count: 0.5, category: "other" },
    { locale: "ar", count: 0, category: "zero" },
    { locale: "ar", count: 2, category: "two" },
    { locale: "ar", count: 3, category: "few" },
    { locale: "cy", count: 6, category: "many" },
  ])("classifies $count as $category in $locale", ({ locale, count, category }) => {
    expect(getPluralCategory(count, locale)).toBe(category);
  });

  it("normalizes underscore locales before asking Intl", () => {
    expect(getPluralCategory(1, "en_US")).toBe("one");
  });

  it("returns fallback category when category lookup fails", () => {
    const failure = new Error("Unsupported locale");
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw failure;
    });

    expect(getPluralCategory(5, "zq-QQ")).toBe("other");
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("Error getting plural category:", failure);
  });
});
