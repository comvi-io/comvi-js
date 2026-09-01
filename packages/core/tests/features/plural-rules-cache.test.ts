import { describe, it, expect } from "vitest";
import { getPluralRules } from "../../src/core/translate/cache";

// needs-seam: the PluralRules cache is module-level with no reset export, so
// every locale tag below must appear in exactly one test.
describe("getPluralRules()", () => {
  it("returns the same instance for a repeated locale", () => {
    const first = getPluralRules("en");

    expect(getPluralRules("en")).toBe(first);
  });

  it("keys cardinal and ordinal rules separately for one locale", () => {
    const cardinal = getPluralRules("en");
    const ordinal = getPluralRules("en", true);

    expect(ordinal).not.toBe(cardinal);
    expect(cardinal.select(2)).toBe("other");
    expect(ordinal.select(2)).toBe("two");
  });

  it("falls back to a usable rules object for a locale tag Intl rejects", () => {
    // An unusable tag must degrade rather than throw out of `t()`. The fallback
    // uses the RUNTIME default locale, whose category for 1 is not knowable as a
    // literal here — deriving it from `Intl` is the only portable expected value,
    // and it re-implements nothing: the production path is the `catch` branch.
    const rules = getPluralRules("not a locale");

    expect(rules).toBeInstanceOf(Intl.PluralRules);
    expect(rules.select(1)).toBe(new Intl.PluralRules(undefined).select(1));
  });

  it("caches the fallback under the rejected tag rather than retrying it", () => {
    const first = getPluralRules("also not a locale");

    expect(getPluralRules("also not a locale")).toBe(first);
  });
});
