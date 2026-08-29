import { describe, it, expect } from "vitest";
import { parseListFlag, resolveFilter, assertAllReturned } from "../src/utils/filterResolution";
import { TypegenError, ErrorCodes } from "../src/utils/errors";
import { thrownBy } from "./helpers";

describe("parseListFlag", () => {
  it.each([undefined, null, 42, true])("returns undefined for non-string input %s", (input) => {
    expect(parseListFlag(input)).toBeUndefined();
  });

  it("splits on comma and trims", () => {
    expect(parseListFlag("forest, share_experience , partner_modal")).toEqual([
      "forest",
      "share_experience",
      "partner_modal",
    ]);
  });

  it.each(["", "   ", ", ,, "])("treats blank-only input %o as undefined (not [''])", (input) => {
    expect(parseListFlag(input)).toBeUndefined();
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
    expect(resolveFilter(["forest"], ["a", "b"]).value).toEqual(["forest"]);
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
    const act = () => assertAllReturned("namespaces", ["forest", "typo_ns"], ["forest", "share"]);

    expect(act).toThrow(TypegenError);
    expect(act).toThrow(/Unknown namespaces: typo_ns/);
    expect(act).toThrow(/Available in project: forest, share/);
    expect(thrownBy(act).code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("does the same diff for locales", () => {
    const act = () => assertAllReturned("locales", ["en", "uk", "xx"], ["en", "uk"]);

    expect(act).toThrow(/Unknown locales: xx/);
    expect(thrownBy(act).code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("renders '(none)' when project returned an empty list", () => {
    expect(() => assertAllReturned("namespaces", ["forest"], [])).toThrow(
      /Available in project: \(none\)/,
    );
  });

  it("includes every missing item, not just the first", () => {
    expect(() => assertAllReturned("namespaces", ["a", "b", "c"], [])).toThrow(
      /Unknown namespaces: a, b, c/,
    );
  });
});
