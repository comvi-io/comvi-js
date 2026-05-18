import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, it, expect } from "vitest";

const SRC_DIR = resolve(__dirname, "../src");

function collectTsFiles(dir: string, exclude: string[] = []): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath, exclude));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      if (!exclude.some((ex) => fullPath.includes(ex))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

describe("defaults drift guard", () => {
  const files = collectTsFiles(SRC_DIR, ["defaults.ts", "types.ts"]);

  it('no source file (except defaults.ts) hardcodes the cookie name "i18n_locale"', () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").includes('"i18n_locale"'));
    expect(hits, `Found hardcoded "i18n_locale" in: ${hits.join(", ")}`).toHaveLength(0);
  });

  it("no source file (except defaults.ts) hardcodes the cookieMaxAge formula 365 * 24 * 60 * 60", () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("365 * 24 * 60 * 60"));
    expect(hits, `Found hardcoded 365 * 24 * 60 * 60 in: ${hits.join(", ")}`).toHaveLength(0);
  });
});
