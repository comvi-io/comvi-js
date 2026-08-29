import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectPluralCategories,
  getPluralCategory,
  usePluralRules,
} from "../src/composables/usePluralRules";

// `usePluralRules` memoises per language code in a module-level cache with no
// reset export, so each test that mocks Intl uses a tag of its own.
describe("usePluralRules()", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

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
});

describe("detectPluralCategories()", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("normalizes underscore locales when detecting categories", () => {
    expect(detectPluralCategories("en_US")).toEqual(["one", "other"]);
  });

  it("falls back to a single other category when Intl.PluralRules is unavailable", () => {
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw new Error("Unsupported locale");
    });

    expect(detectPluralCategories("zy-YY")).toEqual(["other"]);
  });
});

describe("getPluralCategory()", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    [1, "one"],
    [0, "other"],
    [2, "other"],
  ])("classifies %i as %s in english", (count, expected) => {
    expect(getPluralCategory(count, "en")).toBe(expected);
  });

  it("normalizes underscore locales before asking Intl", () => {
    expect(getPluralCategory(1, "en_US")).toBe("one");
  });

  it("returns fallback category when category lookup fails", () => {
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw new Error("Unsupported locale");
    });

    expect(getPluralCategory(5, "zq-QQ")).toBe("other");
  });
});
