import { describe, it, expect } from "vitest";
import { removeInvisibleCharacters } from "../src/utils/encoding";

describe("removeInvisibleCharacters()", () => {
  it("returns an empty string for empty input", () => {
    expect(removeInvisibleCharacters("")).toBe("");
  });

  it("strips every one of the five encoding characters", () => {
    expect(removeInvisibleCharacters("A\u200BB\u200DC\u200CD\u2063E\u2064F")).toBe("ABCDEF");
  });

  it("trims the whitespace left around the stripped characters", () => {
    expect(removeInvisibleCharacters(" \u200B\u200C Preview \u2064 ")).toBe("Preview");
  });

  it("returns text carrying no encoding characters trimmed but otherwise unchanged", () => {
    expect(removeInvisibleCharacters("  Plain text  ")).toBe("Plain text");
  });
});
