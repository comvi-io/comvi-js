import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectPluralCategories,
  getPluralCategory,
  usePluralRules,
} from "../src/composables/usePluralRules";

describe("usePluralRules", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes underscore locales when detecting categories", () => {
    const categories = detectPluralCategories("en_US");

    expect(categories).toContain("one");
    expect(categories).toContain("other");
  });

  it("caches analyzed plural rules for the same language code", () => {
    const first = usePluralRules("en");
    const second = usePluralRules("en");

    expect(second).toBe(first);
  });

  it("returns fallback rules when Intl.PluralRules is unavailable", () => {
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw new Error("Unsupported locale");
    });

    const result = usePluralRules("zz_ZZ");

    expect(result.categories).toEqual(["other"]);
    expect(result.explanations.other).toContain("unable to analyze");
    expect(result.examples.other).toEqual([0, 1, 2, 3, 5, 10]);
  });

  it("returns fallback category when category lookup fails", () => {
    vi.spyOn(Intl, "PluralRules").mockImplementation(function MockPluralRules() {
      throw new Error("Unsupported locale");
    });

    expect(getPluralCategory(5, "zz_ZZ")).toBe("other");
  });

  it("provides deterministic english explanations and examples", () => {
    const result = usePluralRules("en");

    expect(result.explanations.one).toContain("exactly 1");
    expect(result.explanations.other).toContain("except");
    expect(result.examples.one).toEqual([1]);
  });
});
