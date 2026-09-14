/**
 * The vendored locale-routing copy must equal its source byte for byte.
 *
 * `src/runtime/_vendor/locale-routing.ts` is generated and committed (see
 * `scripts/vendor-locale-routing.mjs`), which means the repo can hold two
 * versions of the same code. This is the gate that it cannot: edit either side
 * without regenerating and this fails, naming the command that fixes it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SOURCE_FILE = resolve(__dirname, "../../locale-routing/src/index.ts");
const VENDORED_FILE = resolve(__dirname, "../src/runtime/_vendor/locale-routing.ts");
const REGENERATE = "pnpm --filter @comvi/nuxt vendor";

describe("vendored locale-routing", () => {
  const vendored = readFileSync(VENDORED_FILE, "utf8");

  it("carries the generated header naming the source and the regenerate command", () => {
    expect(vendored).toMatch(/^\/\/ GENERATED from packages\/locale-routing\/src\/index\.ts/);
    expect(vendored).toContain(REGENERATE);
  });

  it("is byte-identical to packages/locale-routing/src/index.ts below the header", () => {
    // The header is the leading run of `//` lines the generator prepends; the
    // source itself opens with a `/** */` block, so nothing of it is stripped.
    const body = vendored.replace(/^(?:\/\/[^\n]*\n)+/, "");

    expect(
      body,
      `The vendored copy has drifted from packages/locale-routing/src/index.ts. Run \`${REGENERATE}\` and commit the result.`,
    ).toBe(readFileSync(SOURCE_FILE, "utf8"));
  });
});
