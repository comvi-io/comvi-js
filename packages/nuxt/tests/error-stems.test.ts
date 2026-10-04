import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SHARED_ERROR_STEMS, errorPrefix } from "@comvi/test-utils/errorStems";

/** Every source file of this package, concatenated: a stem may live in any of them. */
const sources = (dir: string): string =>
  readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(entry.name) ? readFileSync(path, "utf8") : "";
    })
    .join("\n");

describe("error messages: the stems @comvi/next and @comvi/nuxt share", () => {
  const all = sources(resolve(__dirname, "../src"));
  const prefix = errorPrefix("@comvi/nuxt");

  it.each(SHARED_ERROR_STEMS)("spells %s after the package prefix", (stem) => {
    expect(all).toContain(`${prefix} ${stem}`);
  });

  it("uses no prefix but the package name", () => {
    // A message prefix is a bracketed token opening a string literal and followed
    // by a space; `"[locale]"` (a route segment) is not one.
    const prefixes = new Set([...all.matchAll(/["'`](\[[@\w/-]+\]) /g)].map((match) => match[1]));
    expect([...prefixes].filter((p) => p !== prefix)).toEqual([]);
  });
});
