import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { isReleaseOutput } from "../release-output";

const PACKAGE_DIR = resolve("/repo/apps/chrome-extension");

describe("release output detection", () => {
  // The guard used to compare the literal string "dist", so any other
  // spelling of the same directory could package test host permissions.
  it.each([
    ["the plain name", "dist"],
    ["a ./ prefix", "./dist"],
    ["a trailing slash", "dist/"],
    ["a detour through the parent", "../chrome-extension/dist"],
    ["an absolute path", resolve(PACKAGE_DIR, "dist")],
  ])("treats %s as the release directory", (_label, outDir) => {
    expect(isReleaseOutput(outDir, PACKAGE_DIR)).toBe(true);
  });

  it("treats a differently cased name as the release directory on case-insensitive file systems", () => {
    expect(isReleaseOutput("DIST", PACKAGE_DIR, "darwin")).toBe(true);
    expect(isReleaseOutput("DIST", PACKAGE_DIR, "linux")).toBe(false);
  });

  it.each(["dist-gate-e", "dist-system", "./dist-gate-e", resolve(PACKAGE_DIR, "dist-system")])(
    "treats %s as a non-release directory",
    (outDir) => {
      expect(isReleaseOutput(outDir, PACKAGE_DIR)).toBe(false);
    },
  );
});
