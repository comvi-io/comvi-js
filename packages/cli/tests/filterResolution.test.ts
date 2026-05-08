import { describe, it, expect } from "vitest";
import { parseListFlag, resolveFilter, assertAllReturned } from "../src/utils/filterResolution";
import { TypegenError, ErrorCodes } from "../src/utils/errors";

describe("parseListFlag", () => {
  it("returns undefined for non-string input", () => {
    expect(parseListFlag(undefined)).toBeUndefined();
    expect(parseListFlag(null)).toBeUndefined();
    expect(parseListFlag(42)).toBeUndefined();
    expect(parseListFlag(true)).toBeUndefined();
  });

  it("splits on comma and trims", () => {
    expect(parseListFlag("forest, share_experience , partner_modal")).toEqual([
      "forest",
      "share_experience",
      "partner_modal",
    ]);
  });

  it("treats blank-only input as undefined (not [''])", () => {
    expect(parseListFlag("")).toBeUndefined();
    expect(parseListFlag("   ")).toBeUndefined();
    expect(parseListFlag(", ,, ")).toBeUndefined();
  });

  it("filters out blank items between real ones", () => {
    expect(parseListFlag("a,,b, ")).toEqual(["a", "b"]);
  });
});

describe("resolveFilter", () => {
  it("CLI value wins over config", () => {
    expect(resolveFilter(["a"], ["b", "c"])).toEqual({ value: ["a"], source: "cli" });
  });

  it("falls back to config when CLI is undefined", () => {
    expect(resolveFilter(undefined, ["b", "c"])).toEqual({
      value: ["b", "c"],
      source: "config",
    });
  });

  it("returns 'all' when neither CLI nor config is set", () => {
    expect(resolveFilter(undefined, undefined)).toEqual({ value: undefined, source: "all" });
  });

  it("CLI override does NOT merge with config", () => {
    // Important contract: CLI replaces, not adds. A user typing
    // `comvi pull --ns forest` after the config was set to ["a","b"]
    // must end up requesting only ["forest"].
    const result = resolveFilter(["forest"], ["a", "b"]);
    expect(result.value).toEqual(["forest"]);
    expect(result.value).not.toContain("a");
    expect(result.value).not.toContain("b");
  });

  it("CLI value wins even when config is undefined", () => {
    expect(resolveFilter(["a"], undefined)).toEqual({ value: ["a"], source: "cli" });
  });
});

describe("assertAllReturned", () => {
  it("is a no-op when nothing was requested (whole-project pull)", () => {
    expect(() => assertAllReturned("namespaces", undefined, ["a", "b"])).not.toThrow();
    expect(() => assertAllReturned("namespaces", [], ["a", "b"])).not.toThrow();
  });

  it("passes when every requested item came back", () => {
    expect(() =>
      assertAllReturned("namespaces", ["forest", "share"], ["forest", "share", "extra"]),
    ).not.toThrow();
  });

  it("throws VALIDATION_FAILED listing missing items", () => {
    try {
      assertAllReturned("namespaces", ["forest", "typo_ns"], ["forest", "share"]);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TypegenError);
      const e = err as TypegenError;
      expect(e.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(e.message).toContain("Unknown namespaces: typo_ns");
      expect(e.message).toContain("Available in project: forest, share");
    }
  });

  it("does the same diff for languages", () => {
    try {
      assertAllReturned("languages", ["en", "uk", "xx"], ["en", "uk"]);
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as TypegenError;
      expect(e.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(e.message).toContain("Unknown languages: xx");
    }
  });

  it("renders '(none)' when project returned an empty list", () => {
    try {
      assertAllReturned("namespaces", ["forest"], []);
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as TypegenError;
      expect(e.message).toContain("Available in project: (none)");
    }
  });

  it("includes every missing item, not just the first", () => {
    try {
      assertAllReturned("namespaces", ["a", "b", "c"], []);
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as TypegenError;
      expect(e.message).toContain("Unknown namespaces: a, b, c");
    }
  });
});
