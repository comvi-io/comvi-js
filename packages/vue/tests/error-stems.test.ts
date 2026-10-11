import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_PREFIX,
  UNBRACKETED_PREFIX,
  errorPrefix,
  messagePrefixes,
  readSources,
} from "@comvi/test-utils/errorStems";

describe("error messages: the @comvi/vue prefix", () => {
  const all = readSources(resolve(__dirname, "../src"));
  const prefix = errorPrefix("@comvi/vue");

  it("opens every message with the package name", () => {
    expect(all).toContain(prefix);
    expect(messagePrefixes(all).filter((p) => p !== prefix)).toEqual([]);
  });

  it("never writes the anonymous [i18n] prefix", () => {
    expect(all).not.toMatch(ANONYMOUS_PREFIX);
    expect(all).not.toMatch(UNBRACKETED_PREFIX);
  });
});
