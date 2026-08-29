/**
 * `@comvi/core/rich-text` is pure IN THE BUILT ARTIFACT.
 *
 * The source claim (`src/rich-text.ts` has no `./register-tags` import) is not
 * sufficient on its own: the seam reaches the tag grammar through
 * `core/prepareTranslation`, and the grammar used to share a chunk with the
 * module that calls `registerTagSyntax()` at top level. Under that chunking,
 * a source file with no registration import still registered on import. Only
 * the emitted chunk graph can rule that out, so this suite reads it.
 *
 * Requires a fresh build.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

/** The chunk that carries the top-level `registerTagSyntax()` call. */
const REGISTER_CHUNK = "comvi-core-register-tags";

const variants = [
  { label: "prod", suffix: "" },
  { label: "dev", suffix: ".dev" },
] as const;

const entry = (name: string, suffix: string) => path.join(DIST, `comvi-core-${name}${suffix}.js`);

beforeAll(() => {
  // Both variants: the walk below reads the dev entry too, so a missing dev
  // artifact would otherwise surface as a raw ENOENT from `reachableFrom`.
  for (const { suffix } of variants) {
    if (!fs.existsSync(entry("rich-text", suffix))) {
      throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
    }
  }
});

/**
 * Every chunk basename reachable from `start` by following relative
 * import/re-export specifiers. Emitted chunks only import each other by
 * relative path, so the text scan is exact; a chunk pulled in transitively
 * counts, which is the whole point (the seam's registration risk was never a
 * direct import).
 */
function reachableFrom(start: string): string[] {
  const seen = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const code = fs.readFileSync(file, "utf8");
    for (const match of code.matchAll(/from\s*"(\.[^"]+)"|import\s*"(\.[^"]+)"/g)) {
      queue.push(path.resolve(path.dirname(file), match[1] ?? match[2]));
    }
  }

  return [...seen].map((file) => path.basename(file)).sort();
}

describe.each(variants)("$label dist: the rich-text seam", ({ suffix }) => {
  const registerChunk = `${REGISTER_CHUNK}${suffix}.js`;
  const hasGrammar = (names: string[]) =>
    names.some((name) => name.startsWith("comvi-core-tag-syntax"));

  it("does not reach the registration chunk, directly or transitively", () => {
    const reachable = reachableFrom(entry("rich-text", suffix));

    expect(reachable).not.toContain(registerChunk);
    // The grammar itself IS reachable — that is the point of the seam: the
    // extension object travels per call. Only the module that REGISTERS it is
    // out of reach.
    expect(hasGrammar(reachable)).toBe(true);
  });

  it("the ambient entry reaches both, which is what makes the walk above mean something", () => {
    const reachable = reachableFrom(entry("tags", suffix));

    expect(reachable).toContain(registerChunk);
    expect(hasGrammar(reachable)).toBe(true);
  });

  it("the registration chunk keeps its hash-free, sideEffects-listed name", () => {
    expect(fs.existsSync(path.join(DIST, "chunks", `${REGISTER_CHUNK}${suffix}.js`))).toBe(true);
  });
});
