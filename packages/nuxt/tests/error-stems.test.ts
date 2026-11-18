import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_PREFIX,
  UNBRACKETED_PREFIX,
  errorPrefix,
  messagePrefixes,
  readSources,
} from "@comvi/test-utils/errorStems";

describe("error messages", () => {
  const all = readSources(resolve(__dirname, "../src"));
  const prefix = errorPrefix("@comvi/nuxt");

  it("uses no prefix but the package name", () => {
    expect(messagePrefixes(all).filter((p) => p !== prefix)).toEqual([]);
    expect(all).not.toMatch(ANONYMOUS_PREFIX);
    expect(all).not.toMatch(UNBRACKETED_PREFIX);
  });
});
