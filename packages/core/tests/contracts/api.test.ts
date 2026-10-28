/**
 * Public-surface contracts (synthesis §4.4/§4.5):
 * - the instance has exactly the 13 members of design §3.1 + R3-3, no more;
 * - every subpath's BUILT runtime exports equal the VALUE exports its built .d.ts promises
 *   (no declared-but-missing export, no undeclared runtime export), and package.json
 *   `exports` lists exactly the build entries;
 * - at most 60 runtime exports across the core and react entries (react arrives in 1c).
 * Ported by meaning from 0.7 api-contracts.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createI18n } from "../../src/instance";
import { entries } from "../../vite.entries";

const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript") as typeof import("typescript");

const MEMBERS = [
  "locale",
  "dir",
  "ready",
  "t",
  "ns",
  "setLocale",
  "load",
  "add",
  "has",
  "on",
  "rev",
  "destroy",
  "setDefaultParams",
];

describe("the instance", () => {
  it("has exactly 13 own members: 12 + setDefaultParams", () => {
    const i18n = createI18n({ locale: "en" });
    expect(Object.keys(i18n).sort()).toEqual([...MEMBERS].sort());
    expect(Object.getOwnPropertyNames(i18n)).toHaveLength(13);
    expect(Object.getOwnPropertySymbols(i18n)).toEqual([]);
    expect(Object.getPrototypeOf(i18n)).toBe(Object.prototype);
  });

  it("declares the same 13 members in the I18n interface", () => {
    const program = ts.createProgram([path.join(ROOT, "src/instance.ts")], { strict: true });
    const checker = program.getTypeChecker();
    const file = program.getSourceFile(path.join(ROOT, "src/instance.ts"))!;
    const iface = checker
      .getExportsOfModule(checker.getSymbolAtLocation(file)!)
      .find((s) => s.name === "I18n")!;
    const names = checker
      .getDeclaredTypeOfSymbol(iface)
      .getProperties()
      .map((p) => p.name);
    expect(names.sort()).toEqual([...MEMBERS].sort());
  });
});

const DIST = path.join(ROOT, "dist");
const distFile = (entry: string, ext: "d.ts" | "js") =>
  path.join(
    DIST,
    ext === "d.ts"
      ? `${entry}.d.ts`
      : entry === "index"
        ? "comvi-core.js"
        : `comvi-core-${entry}.js`,
  );

/** Value exports each entry's BUILT declaration file promises (dist/<entry>.d.ts). */
const declaredValues = (): Record<string, string[]> => {
  const names = Object.keys(entries(ROOT));
  for (const n of names)
    if (!fs.existsSync(distFile(n, "d.ts")))
      throw new Error(`dist/${n}.d.ts is missing — run \`pnpm build\` (turbo runs it before test)`);
  const program = ts.createProgram(
    names.map((n) => distFile(n, "d.ts")),
    { strict: true, noEmit: true, skipLibCheck: true },
  );
  const checker = program.getTypeChecker();
  const out: Record<string, string[]> = {};
  for (const n of names) {
    const sym = checker.getSymbolAtLocation(program.getSourceFile(distFile(n, "d.ts"))!)!;
    out[n] = checker
      .getExportsOfModule(sym)
      .filter((s) => {
        const t = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
        return (t.flags & ts.SymbolFlags.Value) !== 0;
      })
      .map((s) => s.name)
      .sort();
  }
  return out;
};

describe("exports", () => {
  const declared = declaredValues();

  it.each(Object.keys(entries(ROOT)))(
    "%s: built runtime exports == built .d.ts value exports",
    async (n) => {
      const mod = await import(distFile(n, "js"));
      expect(declared[n].length).toBeGreaterThan(0);
      expect(Object.keys(mod).sort()).toEqual(declared[n]);
    },
  );

  it("package.json `exports` lists exactly the build entries, each with types, development and default", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const names = Object.keys(entries(ROOT)).map((n) => (n === "index" ? "." : `./${n}`));
    expect(Object.keys(pkg.exports).sort()).toEqual(names.sort());
    for (const [sub, target] of Object.entries(
      pkg.exports as Record<string, Record<string, string>>,
    )) {
      const base = sub === "." ? "index" : sub.slice(2);
      const js = sub === "." ? "comvi-core" : `comvi-core-${base}`;
      expect(target).toEqual({
        types: `./dist/${base}.d.ts`,
        development: `./dist/${js}.dev.js`,
        default: `./dist/${js}.js`,
      });
    }
  });

  it("at most 60 runtime exports across the core entries (+ react in lot 1c)", () => {
    const total = Object.values(declared).reduce((n, names) => n + names.length, 0);
    expect(total).toBeLessThanOrEqual(60);
  });
});

describe("error messages (0.7 error-stems)", () => {
  const sources = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? sources(p) : p.endsWith(".ts") ? [p] : [];
    });
  const thrown = sources(path.join(ROOT, "src")).flatMap((f) =>
    [...fs.readFileSync(f, "utf8").matchAll(/\b(?:Type|Range)?Error\(\s*[`"']([^`"']*)/g)].map(
      (m) => m[1],
    ),
  );

  it("finds the messages it checks", () => expect(thrown.length).toBeGreaterThanOrEqual(5));

  it("open every thrown message with the package (or subpath) name in brackets", () => {
    for (const m of thrown) expect(m).toMatch(/^\[@comvi\/core(\/\w+)?\] /);
  });
});
