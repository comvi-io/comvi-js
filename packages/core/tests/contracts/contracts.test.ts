/**
 * Architecture contracts of the new core (design §2.1, synthesis §4.4):
 * - no classes and no `#private` in src (+121 / +452 B, measured in the size floor);
 * - the production graph holds no console call (prod is silent by default);
 * - no `eval` / `new Function` anywhere — strict CSP (`script-src 'self'`) must work.
 *
 * Each check is shown failing on a planted counter-example first, so a check that
 * cannot see its target does not pass silently.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");
const require = createRequire(path.join(ROOT, "package.json"));
const esbuild = require("esbuild") as typeof import("esbuild");

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : p.endsWith(".ts") ? [p] : [];
  });

/** Strips comments and string/template/regex-free text roughly enough for a token scan. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CLASS = /(^|[^\w$.])class\s+[A-Za-z_$]/m;
const PRIVATE = /(this\.#|^\s*#[A-Za-z_$][\w$]*\s*[;=:(])/m;
const EVAL = /(^|[^\w$.])eval\s*\(|new\s+Function\s*\(|[^\w$.]Function\s*\(\s*["'`]/;

const bundle = (dev: boolean) =>
  esbuild.buildSync({
    stdin: {
      contents: 'export * from "./src/index.ts"; export * from "./src/internal.ts";',
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2020",
    define: { __DEV__: String(dev) },
  }).outputFiles[0].text;

describe("source contracts", () => {
  const files = sources(SRC);

  it("scans every source file", () => {
    expect(files.map((f) => path.relative(SRC, f)).sort()).toEqual(
      expect.arrayContaining(["compile/cache.ts", "compile/scanner.ts", "locale.ts", "types.ts"]),
    );
  });

  it("the patterns catch planted counter-examples", () => {
    expect(CLASS.test("export class Foo {}")).toBe(true);
    expect(CLASS.test("const C = class Bar {}")).toBe(true);
    expect(PRIVATE.test("  #state = 1;")).toBe(true);
    expect(PRIVATE.test("return this.#x")).toBe(true);
    expect(EVAL.test("x = eval(src)")).toBe(true);
    expect(EVAL.test("new Function('a', 'b')")).toBe(true);
    expect(CLASS.test("className: 'x'")).toBe(false);
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))(
    "%s has no class, #private, eval or new Function",
    (_n, f) => {
      const text = code(fs.readFileSync(f, "utf8"));
      expect(text).not.toMatch(CLASS);
      expect(text).not.toMatch(PRIVATE);
      expect(text).not.toMatch(EVAL);
    },
  );
});

describe("production graph", () => {
  it("the development graph does print (the check below is not vacuous)", () => {
    expect(bundle(true)).toMatch(/console\.(error|warn)/);
  });

  it("holds no console call", () => {
    expect(bundle(false)).not.toMatch(/console/);
  });

  it("holds no eval or Function constructor", () => {
    const prod = bundle(false);
    expect(prod).not.toMatch(EVAL);
    expect(prod).not.toMatch(/\bFunction\(/);
  });

  it("holds no development message text", () => {
    expect(bundle(false)).not.toMatch(/is never closed|has no handler|useFormat\(\)/);
  });
});
