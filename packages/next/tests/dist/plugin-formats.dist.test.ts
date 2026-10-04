// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * `@comvi/next/plugin` is loaded by next.config, and Next 15 transpiles
 * `next.config.ts` to CommonJS and `require()`s it. Node only gained
 * `require(esm)` in 20.19 and 22.12, and `engines` says `>=20`, so the entry
 * ships both formats: `import` → `dist/plugin.js`, `require` → `dist/plugin.cjs`.
 *
 * Both are loaded here the way a consumer does, through the package's own
 * exports map (Node resolves a package's self-reference by name), in a
 * separate Node process so vitest's resolver is not involved.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");

beforeAll(() => {
  for (const file of ["plugin.js", "plugin.cjs"]) {
    if (!fs.existsSync(path.join(packageRoot, "dist", file))) {
      throw new Error(`dist is missing — build @comvi/next before this test (${file})`);
    }
  }
});

const run = (args: string[]) => {
  const result = spawnSync(process.execPath, args, { cwd: packageRoot, encoding: "utf8" });
  return { status: result.status, out: `${result.stdout}${result.stderr}`.trim() };
};

describe("@comvi/next/plugin", () => {
  it("require() from a CommonJS script returns withComvi, from dist/plugin.cjs", () => {
    const { status, out } = run([
      "--input-type=commonjs",
      "-e",
      'const m = require("@comvi/next/plugin");' +
        'console.log(typeof m.withComvi, require.resolve("@comvi/next/plugin").split("/").pop());',
    ]);
    expect({ status, out }).toEqual({ status: 0, out: "function plugin.cjs" });
  });

  it("import from an ES module returns withComvi, from dist/plugin.js", () => {
    const { status, out } = run([
      "--input-type=module",
      "-e",
      'const m = await import("@comvi/next/plugin");' +
        'console.log(typeof m.withComvi, import.meta.resolve("@comvi/next/plugin").split("/").pop());',
    ]);
    expect({ status, out }).toEqual({ status: 0, out: "function plugin.js" });
  });

  it("the CommonJS build carries no import of its own beyond node builtins and next", () => {
    const source = fs.readFileSync(path.join(packageRoot, "dist/plugin.cjs"), "utf8");
    const required = [...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(required.every((spec) => spec.startsWith("node:") || spec === "next")).toBe(true);
  });
});
