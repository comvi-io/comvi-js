#!/usr/bin/env node
// Post-build STOPGAP that makes the vite-plugin-dts declaration output resolve
// correctly under node16/nodenext module resolution for BOTH ESM and CJS consumers.
//
// vite-plugin-dts 4.5.x emits a single `.d.ts` tree whose internal relative
// re-exports are EXTENSIONLESS (`from './core/i18n'`). Under node16 resolution that
// fails (`InternalResolutionError`) because node16 requires an explicit module
// extension. There is also no CJS-flavored declaration, so a `require` condition
// pointing at the ESM `.d.ts` is a FalseCJS/FalseESM. This tool fixes both, with no
// second declaration generator (which would reintroduce double-source drift):
//
//   1. ESM `.d.ts` (rewritten IN PLACE): internal relative specifiers get an explicit
//      `.js` extension (`./core/i18n` → `./core/i18n.js`). TS maps `.js` → the adjacent
//      `.d.ts` under node16, and `.js` is also correct for bundler resolution.
//   2. CJS `.d.cts` (emitted as a sibling of each `.d.ts`): a copy whose internal
//      relative specifiers get an explicit `.cjs` extension (`./core/i18n.cjs`). TS maps
//      `.cjs` → the adjacent `.d.cts` under node16-cjs. Packages then point
//      `require.types` at `*.d.cts`.
//
// External specifiers (`@comvi/core`, `react`, `vue`, bare) and non-module assets
// (`./locales/en.json` in JSDoc) are left unchanged. The `//# sourceMappingURL=*.d.ts.map`
// trailer is stripped (no `.d.cts.map`/rewritten map is emitted). `*.vue.d.ts` and
// `/// <reference path=... />` directives are handled; `/// <reference types=... />`
// is left untouched. Idempotent — re-running never produces `.js.js`/`.cjs.cjs`.
//
// Ground truth for both rewrites is `node scripts/check-types-exports.mjs <pkg>`
// (attw under node16 + node16-cjs); verified zero problems on core/react/vue/next.
//
// Removal trigger: drop this tool the moment vite-plugin-dts ships native dual-format
// declaration emission with explicit extensions (see plan ADR / Follow-ups).
//
// Usage:
//   node tooling/emit-d-cts.mjs                 # all dual packages (default list)
//   node tooling/emit-d-cts.mjs core next       # only the named package dirs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DUAL_PACKAGES } from "./dual-packages.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const packagesDir = path.join(rootDir, "packages");

// Asset extensions that are NOT JS/TS modules — relative specifiers ending in these
// (e.g. `import('./locales/en.json')` inside JSDoc) must NOT be given a JS extension.
const NON_MODULE_EXT = /\.(json|css|scss|sass|less|svg|png|jpe?g|gif|webp|wasm)$/i;
// Module extensions that already make a specifier node16-resolvable — leave as-is
// (also makes the rewrite idempotent: `./x.js` is not turned into `./x.js.js`).
const ALREADY_EXPLICIT = /\.(js|cjs|mjs)$/i;

function isRelative(spec) {
  return spec.startsWith("./") || spec.startsWith("../");
}

// Append `targetExt` to an internal relative specifier so node16 can resolve it to the
// adjacent declaration (.js → .d.ts for ESM; .cjs → .d.cts for CJS). External
// specifiers, non-module assets, and already-explicit module specifiers are unchanged.
function rewriteSpecifier(spec, targetExt) {
  if (!isRelative(spec)) return spec;
  if (NON_MODULE_EXT.test(spec)) return spec;
  if (ALREADY_EXPLICIT.test(spec)) return spec;
  // vite-plugin-dts may also emit explicit `.d.ts`/`.d.cts`; normalize to the bare
  // module form with the target runtime extension.
  if (spec.endsWith(".d.ts")) return `${spec.slice(0, -".d.ts".length)}${targetExt}`;
  if (spec.endsWith(".d.cts")) return `${spec.slice(0, -".d.cts".length)}${targetExt}`;
  if (spec.endsWith(".ts")) return `${spec.slice(0, -".ts".length)}${targetExt}`;
  // Extensionless internal specifier (the common vite-plugin-dts shape).
  return `${spec}${targetExt}`;
}

// Rewrite all relative module specifiers in a declaration file's text, appending
// `targetExt` (`.js` for the ESM `.d.ts`, `.cjs` for the CJS `.d.cts`). Also strips the
// sourcemap trailer and rewrites triple-slash `path` references.
function transform(source, targetExt) {
  let out = source;

  // Strip the sourcemap trailer pointing at a (now-stale / non-existent) `.d.ts.map`.
  out = out.replace(/\n?\/\/# sourceMappingURL=\S+\.d\.ts\.map\s*$/m, "");

  // `from '...'` and `export ... from '...'` (covers `export * from`, `export { x } from`).
  out = out.replace(/(\bfrom\s*)(['"])([^'"]+)\2/g, (m, kw, q, spec) => {
    const next = rewriteSpecifier(spec, targetExt);
    return next === spec ? m : `${kw}${q}${next}${q}`;
  });

  // Side-effect imports: `import '...';` (no bindings). Anchor to line start to avoid
  // matching the `import` keyword inside `import { x } from '...'` (handled above).
  out = out.replace(/^(\s*import\s+)(['"])([^'"]+)\2/gm, (m, kw, q, spec) => {
    const next = rewriteSpecifier(spec, targetExt);
    return next === spec ? m : `${kw}${q}${next}${q}`;
  });

  // Dynamic / type-position `import('...')` referring to a relative MODULE (not a
  // JSDoc `.json` asset, which rewriteSpecifier leaves alone).
  out = out.replace(/(\bimport\(\s*)(['"])([^'"]+)\2(\s*\))/g, (m, kw, q, spec, close) => {
    const next = rewriteSpecifier(spec, targetExt);
    return next === spec ? m : `${kw}${q}${next}${q}${close}`;
  });

  // Triple-slash `path` references → sibling with the target extension; `types`
  // references are left untouched.
  out = out.replace(/(\/\/\/\s*<reference\s+path\s*=\s*)(['"])([^'"]+)\2/g, (m, kw, q, spec) => {
    const next = rewriteSpecifier(spec, targetExt);
    return next === spec ? m : `${kw}${q}${next}${q}`;
  });

  return out;
}

// Map an emitted declaration filename to its `.d.cts` twin, preserving any
// double-extension (`App.vue.d.ts` → `App.vue.d.cts`).
function toCtsName(fileName) {
  return `${fileName.slice(0, -".d.ts".length)}.d.cts`;
}

async function collectDtsFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectDtsFiles(full)));
    } else if (entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

async function emitForPackage(pkg) {
  const distDir = path.join(packagesDir, pkg, "dist");
  if (!existsSync(distDir)) {
    return { pkg, skipped: true, reason: "no dist (build first)" };
  }
  const dtsFiles = await collectDtsFiles(distDir);
  for (const dtsPath of dtsFiles) {
    const source = readFileSync(dtsPath, "utf8");
    // 1. ESM `.d.ts`: rewrite IN PLACE with explicit `.js` specifiers (idempotent).
    writeFileSync(dtsPath, transform(source, ".js"));
    // 2. CJS `.d.cts`: emit a sibling with explicit `.cjs` specifiers.
    writeFileSync(toCtsName(dtsPath), transform(source, ".cjs"));
  }
  return { pkg, count: dtsFiles.length };
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : DUAL_PACKAGES;

const results = [];
for (const pkg of targets) {
  results.push(await emitForPackage(pkg));
}

let any = false;
for (const r of results) {
  if (r.skipped) {
    console.log(`SKIP ${r.pkg}: ${r.reason}`);
  } else if (r.count > 0) {
    any = true;
    console.log(`OK   ${r.pkg}: rewrote ${r.count} .d.ts + emitted ${r.count} .d.cts`);
  } else {
    console.log(`SKIP ${r.pkg}: no .d.ts files found (dist exists but declarations missing)`);
  }
}

if (!any) {
  console.error("emit-d-cts: nothing emitted (did you run `pnpm build` first?)");
  process.exit(1);
}
