/**
 * Public-surface contracts of @comvi/vue (synthesis §4.4/§4.5), on the BUILT dist:
 * - each entry's runtime exports == the value exports its .d.ts promises, and package.json
 *   `exports` lists exactly the build entries (types, development, default);
 * - at most 60 runtime exports across the core AND vue entries (the sum of both, the same
 *   budget as core + react);
 * - `createI18n` wraps core's own constructor (one CORE seam per app), `handover` is core's;
 * - the production build carries no diagnostics; no class, no #private;
 * - every thrown message opens with [@comvi/vue] (0.7 error-stems).
 * Ported by meaning from 0.7 root-entry.test.ts, error-stems.test.ts and
 * vue-i18n-contracts.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { entries as vueEntries } from "../../vite.entries";
import { entries as coreEntries } from "../../../core/vite.entries";

const ROOT = path.resolve(__dirname, "../..");
const CORE = path.resolve(ROOT, "../core");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript") as typeof import("typescript");

const js = (pkg: "vue" | "core", entry: string, dev = "") =>
  path.join(
    pkg === "vue" ? ROOT : CORE,
    "dist",
    `comvi-${pkg}${entry === "index" ? "" : `-${entry}`}${dev}.js`,
  );
const dts = (pkg: "vue" | "core", entry: string) =>
  path.join(pkg === "vue" ? ROOT : CORE, "dist", `${entry}.d.ts`);

/** Value exports each entry's BUILT declaration file promises. */
const declared = (pkg: "vue" | "core", names: string[]) => {
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

const VUE = Object.keys(vueEntries(ROOT));
const CORES = Object.keys(coreEntries(CORE));

describe("exports", () => {
  const vue = declared("vue", VUE);

  it.each(VUE)("%s: built runtime exports == built .d.ts value exports", async (n) => {
    const mod = await import(js("vue", n));
    expect(vue[n].length).toBeGreaterThan(0);
    expect(Object.keys(mod).sort()).toEqual(vue[n]);
  });

  it("the root exports createI18n, useI18n, <T> and handover; /format exports useFormat", () => {
    expect(vue.index).toEqual(["T", "createI18n", "handover", "useI18n"]);
    expect(vue.format).toEqual(["useFormat"]);
  });

  it("package.json `exports` lists exactly the build entries, each with types, development and default", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(Object.keys(pkg.exports).sort()).toEqual(
      VUE.map((n) => (n === "index" ? "." : `./${n}`)).sort(),
    );
    for (const [sub, target] of Object.entries(pkg.exports as Record<string, unknown>)) {
      const base = sub === "." ? "index" : sub.slice(2);
      const file = `./dist/comvi-vue${base === "index" ? "" : `-${base}`}`;
      expect(target).toEqual({
        types: `./dist/${base}.d.ts`,
        development: `${file}.dev.js`,
        default: `${file}.js`,
      });
    }
  });

  it("at most 60 runtime exports across the core and vue entries", async () => {
    let total = 0;
    for (const n of CORES) total += Object.keys(await import(js("core", n))).length;
    for (const n of VUE) total += Object.keys(await import(js("vue", n))).length;
    expect(total).toBeGreaterThan(40);
    expect(total).toBeLessThanOrEqual(60);
  });

  it("wraps core's own createI18n and re-exports core's handover, never a copy", () => {
    // Statically: the tests alias @comvi/core to its source, so identity is not observable here.
    const files = fs
      .readdirSync(path.join(ROOT, "dist"), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".js"))
      .map((f) => fs.readFileSync(path.join(ROOT, "dist", f), "utf8"))
      .join("\n");
    expect(files).toMatch(/import \{ createI18n \} from "@comvi\/core";/);
    expect(files).toMatch(/import \{ handover \} from "@comvi\/core\/internal";/);
    expect(files).not.toMatch(/\bfunction createI18n\b|handover\s*=/);
  });
});

describe("the build", () => {
  const files = fs
    .readdirSync(path.join(ROOT, "dist"), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(ROOT, "dist", f));

  it("keeps diagnostics out of the production files and in the development ones", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    const text = (dev: boolean) =>
      files
        .filter((f) => f.endsWith(".dev.js") === dev)
        .map((f) => fs.readFileSync(f, "utf8"))
        .join("");
    expect(text(false)).not.toContain("[@comvi/vue]");
    expect(text(true)).toContain("[@comvi/vue] no app.use(i18n)");
    expect(text(true)).toContain("[@comvi/vue] an instance is installed into a second app");
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

  it("finds the messages it checks", () => expect(thrown.length).toBeGreaterThanOrEqual(2));

  it("opens every thrown message with [@comvi/vue], never the anonymous [i18n]", () => {
    for (const m of thrown) expect(m).toMatch(/^\[@comvi\/vue\] /);
  });
});
