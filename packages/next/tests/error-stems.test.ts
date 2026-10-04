import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_PREFIX,
  SHARED_ERROR_STEMS,
  errorPrefix,
  messagePrefixes,
  readSources,
} from "@comvi/test-utils/errorStems";

describe("error messages: the stems @comvi/next and @comvi/nuxt share", () => {
  const all = readSources(resolve(__dirname, "../src"));
  const prefix = errorPrefix("@comvi/next");

  it.each(SHARED_ERROR_STEMS)("spells %s after the package prefix", (stem) => {
    expect(all).toContain(`${prefix} ${stem}`);
  });

  it("uses no prefix but the package name", () => {
    expect(messagePrefixes(all).filter((p) => p !== prefix)).toEqual([]);
    expect(all).not.toMatch(ANONYMOUS_PREFIX);
  });
});
