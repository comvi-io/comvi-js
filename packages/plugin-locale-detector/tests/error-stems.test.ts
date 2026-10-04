import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANONYMOUS_PREFIX, messagePrefixes, readSources } from "@comvi/test-utils/errorStems";

// This package writes no runtime message today. A message it gains opens with
// `[@comvi/plugin-locale-detector]`, the package name, like every other one.
describe("error messages: the @comvi/plugin-locale-detector prefix", () => {
  const all = readSources(resolve(__dirname, "../src"));

  it("writes no message under another package's prefix", () => {
    expect(messagePrefixes(all).filter((p) => p !== "[@comvi/plugin-locale-detector]")).toEqual([]);
  });

  it("never writes the anonymous [i18n] prefix", () => {
    expect(all).not.toMatch(ANONYMOUS_PREFIX);
  });
});
