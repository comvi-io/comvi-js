/**
 * Public-surface contracts of @comvi/react (synthesis §4.4/§4.5), on the BUILT dist:
 * - each entry's runtime exports == the value exports its .d.ts promises, and package.json
 *   `exports` lists exactly the build entries (types, development, default);
 * - at most 60 runtime exports across the core AND react entries (the sum of both);
 * - `createI18n` is core's own binding, not a copy (one CORE seam per app);
 * - every chunk starts with "use client"; the production build carries no diagnostics;
 * - every thrown message opens with [@comvi/react] (0.7 error-stems).
 * Ported by meaning from 0.7 root-entry.test.tsx and error-stems.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { entries as reactEntries } from "../../vite.entries";
import { entries as coreEntries } from "../../../core/vite.entries";

const ROOT = path.resolve(__dirname, "../..");
const CORE = path.resolve(ROOT, "../core");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript") as typeof import("typescript");

const js = (pkg: "react" | "core", entry: string, dev = "") =>
  path.join(
    pkg === "react" ? ROOT : CORE,
    "dist",
    `comvi-${pkg}${entry === "index" ? "" : `-${entry}`}${dev}.js`,
  );
const dts = (pkg: "react" | "core", entry: string) =>
  path.join(pkg === "react" ? ROOT : CORE, "dist", `${entry}.d.ts`);

/** Value exports each entry's BUILT declaration file promises. */
const declared = (pkg: "react" | "core", names: string[]) => {
  for (const n of names)
    if (!fs.existsSync(dts(pkg, n)))
      throw new Error(`${dts(pkg, n)} is missing — run \`pnpm build\``);
  const program = ts.createProgram(
    names.map((n) => dts(pkg, n)),
    { strict: true, noEmit: true, skipLibCheck: true },
  );
  const checker = program.getTypeChecker();
  return Object.fromEntries(
    names.map((n) => {
      const sym = checker.getSymbolAtLocation(program.getSourceFile(dts(pkg, n))!)!;
      const values = checker
        .getExportsOfModule(sym)
        .filter((s) => {
          const t = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
          return (t.flags & ts.SymbolFlags.Value) !== 0;
        })
        .map((s) => s.name)
        .sort();
      return [n, values];
    }),
  );
};

const REACT = Object.keys(reactEntries(ROOT));
const CORES = Object.keys(coreEntries(CORE));

describe("exports", () => {
  const react = declared("react", REACT);

  it.each(REACT)("%s: built runtime exports == built .d.ts value exports", async (n) => {
    const mod = await import(js("react", n));
    expect(react[n].length).toBeGreaterThan(0);
    expect(Object.keys(mod).sort()).toEqual(react[n]);
  });

  it("the root exports the binding and core's createI18n; /format exports useFormat", () => {
    expect(react.index).toEqual(
      ["I18nHandover", "I18nProvider", "T", "createI18n", "useI18n", "useLocale"].sort(),
    );
    expect(react.format).toEqual(["useFormat"]);
  });

  it("package.json `exports` lists exactly the build entries, each with types, development and default", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(Object.keys(pkg.exports).sort()).toEqual(
      REACT.map((n) => (n === "index" ? "." : `./${n}`)).sort(),
    );
    for (const [sub, target] of Object.entries(pkg.exports as Record<string, unknown>)) {
      const base = sub === "." ? "index" : sub.slice(2);
      const file = `./dist/comvi-react${base === "index" ? "" : `-${base}`}`;
      expect(target).toEqual({
        types: `./dist/${base}.d.ts`,
        development: `${file}.dev.js`,
        default: `${file}.js`,
      });
    }
  });

  it("at most 60 runtime exports across the core and react entries", async () => {
    let total = 0;
    for (const n of CORES) total += Object.keys(await import(js("core", n))).length;
    for (const n of REACT) total += Object.keys(await import(js("react", n))).length;
    expect(total).toBeGreaterThan(40);
    expect(total).toBeLessThanOrEqual(60);
  });

  it("re-exports core's own createI18n (one instance seam), not a copy", () => {
    // Statically: the tests alias @comvi/core to its source, so identity is not observable here.
    const root = fs.readFileSync(js("react", "index"), "utf8");
    expect(root).toMatch(/import \{ createI18n \} from "@comvi\/core";/);
    for (const f of fs.readdirSync(path.join(ROOT, "dist"), { recursive: true, encoding: "utf8" }))
      if (f.endsWith(".js"))
        expect(fs.readFileSync(path.join(ROOT, "dist", f), "utf8")).not.toMatch(/createI18n\s*=/);
  });
});

describe("the build", () => {
  const files = fs
    .readdirSync(path.join(ROOT, "dist"), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(ROOT, "dist", f));

  it('starts every chunk with "use client"', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files)
      expect(fs.readFileSync(f, "utf8").startsWith('"use client";\n')).toBe(true);
  });

  it("keeps diagnostics out of the production files and in the development ones", () => {
    const text = (dev: boolean) =>
      files
        .filter((f) => f.endsWith(".dev.js") === dev)
        .map((f) => fs.readFileSync(f, "utf8"))
        .join("");
    expect(text(false)).not.toContain("[@comvi/react]");
    expect(text(true)).toContain("[@comvi/react] no <I18nProvider>");
  });

  it("has no class and no #private in the binding (contract, as core)", () => {
    for (const f of files) expect(fs.readFileSync(f, "utf8")).not.toMatch(/\bclass\s|#\w+\s*[=(;]/);
  });
});

describe("error messages (0.7 error-stems)", () => {
  const src = fs
    .readdirSync(path.join(ROOT, "src"))
    .map((f) => fs.readFileSync(path.join(ROOT, "src", f), "utf8"))
    .join("\n");
  const thrown = [...src.matchAll(/\b(?:Type|Range)?Error\(\s*[`"']([^`"']*)/g)].map((m) => m[1]);

  it("finds the messages it checks", () => expect(thrown.length).toBeGreaterThanOrEqual(1));

  it("opens every thrown message with [@comvi/react], never the anonymous [i18n]", () => {
    for (const m of thrown) expect(m).toMatch(/^\[@comvi\/react\] /);
  });
});
