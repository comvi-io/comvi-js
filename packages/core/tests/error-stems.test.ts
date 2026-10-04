import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// `@comvi/test-utils/errorStems` holds this rule for every other package; core
// cannot import it (that package depends on core), so the two patterns below
// are spelled out here and must match the ones there.
const MESSAGE_PREFIX = /["'`](\[[^\]\s"'`]+\]) /g;
const ANONYMOUS_PREFIX = /["'`]\[i18n\]/;

const readSources = (dir: string): string =>
  readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return readSources(path);
      return /\.ts$/.test(entry.name) ? readFileSync(path, "utf8") : "";
    })
    .join("\n");

describe("error messages: the @comvi/core prefix", () => {
  const all = readSources(resolve(__dirname, "../src"));
  const prefix = "[@comvi/core]";

  it("opens every message with the package name", () => {
    const prefixes = new Set([...all.matchAll(MESSAGE_PREFIX)].map((match) => match[1]));
    expect(all).toContain(prefix);
    expect([...prefixes].filter((p) => p !== prefix)).toEqual([]);
  });

  it("never writes the anonymous [i18n] prefix", () => {
    expect(all).not.toMatch(ANONYMOUS_PREFIX);
  });
});
