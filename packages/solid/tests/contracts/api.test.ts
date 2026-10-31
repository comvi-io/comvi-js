/**
 * Public-surface contracts of @comvi/solid, on the BUILT dist: each entry's runtime exports ==
 * the value exports its .d.ts promises (the 0.7 `t` leak, as on React); package.json `exports`
 * lists exactly the build entries; `createI18n` is core's own; the production build carries no
 * diagnostics and no DOM compile output (`template`), so one build serves the server too;
 * every thrown message opens with [@comvi/solid].
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { entries } from "../../vite.entries";

const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript") as typeof import("typescript");

const js = (entry: string, dev = "") =>
  path.join(ROOT, "dist", `comvi-solid${entry === "index" ? "" : `-${entry}`}${dev}.js`);
const dts = (entry: string) => path.join(ROOT, "dist", `${entry}.d.ts`);
const NAMES = Object.keys(entries(ROOT));

/** Value exports each entry's BUILT declaration file promises. */
const declared = (names: string[]) => {
  for (const n of names)
    if (!fs.existsSync(dts(n))) throw new Error(`${dts(n)} is missing — run \`pnpm build\``);
  const program = ts.createProgram(names.map(dts), {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  return Object.fromEntries(
    names.map((n) => {
      const sym = checker.getSymbolAtLocation(program.getSourceFile(dts(n))!)!;
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

/** Named exports of an ES module's source (externals are not loaded). */
const runtime = (file: string) =>
  [...fs.readFileSync(file, "utf8").matchAll(/export \{([^}]*)\}/g)]
    .flatMap((m) => m[1].split(","))
    .map((s) => s.trim().split(" as ").pop()!)
    .filter(Boolean)
    .sort();

describe("exports", () => {
  const values = declared(NAMES);

  it.each(NAMES)("%s: built runtime exports == built .d.ts value exports", (n) => {
    expect(values[n].length).toBeGreaterThan(0);
    expect(runtime(js(n))).toEqual(values[n]);
  });

  it("the root exports the binding, core's createI18n and handover; /format exports useFormat", () => {
    expect(values.index).toEqual(["I18nProvider", "T", "createI18n", "handover", "useI18n"].sort());
    expect(values.format).toEqual(["useFormat"]);
  });

  it("package.json `exports` lists exactly the build entries, each with types, development and default", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(Object.keys(pkg.exports).sort()).toEqual(
      NAMES.map((n) => (n === "index" ? "." : `./${n}`)).sort(),
    );
    for (const [sub, target] of Object.entries(pkg.exports as Record<string, unknown>)) {
      const base = sub === "." ? "index" : sub.slice(2);
      const file = `./dist/comvi-solid${base === "index" ? "" : `-${base}`}`;
      expect(target).toEqual({
        types: `./dist/${base}.d.ts`,
        development: `${file}.dev.js`,
        default: `${file}.js`,
      });
    }
  });

  it("re-exports core's own createI18n (one instance seam), not a copy", () => {
    const root = fs.readFileSync(js("index"), "utf8");
    expect(root).toMatch(/createI18n[^;]*from "@comvi\/core";/);
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
  const text = (dev: boolean) =>
    files
      .filter((f) => f.endsWith(".dev.js") === dev)
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("");

  it("keeps diagnostics out of the production files and in the development ones", () => {
    expect(text(false)).not.toContain("[@comvi/solid]");
    expect(text(true)).toContain("[@comvi/solid] no <I18nProvider>");
  });

  it("imports nothing a server build lacks: no `template`, `insert`, no JSX left", () => {
    for (const dev of [false, true])
      expect(text(dev)).not.toMatch(/\b(template|insert|delegateEvents)\b.*from "solid-js\/web"/);
  });

  it("names none of the 0.7 surface", () => {
    expect(text(false)).not.toMatch(/localeSource|subscribeToRevision|@comvi\/core\/rich-text/);
  });

  it("has no class and no #private in the binding (contract, as core)", () => {
    for (const f of files) expect(fs.readFileSync(f, "utf8")).not.toMatch(/\bclass\s|#\w+\s*[=(;]/);
  });
});

describe("error messages", () => {
  const src = fs
    .readdirSync(path.join(ROOT, "src"))
    .map((f) => fs.readFileSync(path.join(ROOT, "src", f), "utf8"))
    .join("\n");
  const thrown = [...src.matchAll(/\b(?:Type|Range)?Error\(\s*[`"']([^`"']*)/g)].map((m) => m[1]);

  it("finds the messages it checks", () => expect(thrown.length).toBeGreaterThanOrEqual(1));

  it("opens every thrown message with [@comvi/solid]", () => {
    for (const m of thrown) expect(m).toMatch(/^\[@comvi\/solid\] /);
  });
});
