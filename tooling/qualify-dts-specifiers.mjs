#!/usr/bin/env node
// Rewrite every EXTENSIONLESS relative specifier in a package's emitted `.d.ts`
// into an extension-qualified one (`./options` → `./options.js`, `./cdn/index`
// → `./cdn/index.js`), so the shipped declarations resolve under
// `moduleResolution: node16`/`nodenext`.
//
// WHY THIS EXISTS
// ---------------
// TypeScript emits declaration specifiers VERBATIM from the source. Our sources
// are written for `moduleResolution: "bundler"`, where `./options` is legal, so
// the emitted `dist/*.d.ts` inherits extensionless specifiers. Under node16/
// nodenext ESM there is NO extension substitution and NO directory-index lookup:
// a bare `./options` simply does not resolve. That has two consequences in a
// consumer's `tsc`, and only ONE of them is loud:
//
//   * `export * from './cdn/index'` — the star has no names to re-export, so the
//     entry point ends up with ZERO exported members:
//     `TS2305: Module '"@comvi/plugin-fetch-loader/cdn"' has no exported member
//     'cdnLoader'`.
//   * `export { X } from './options'` — the name X is still declared, but bound
//     to an unresolved module, so it silently degrades to `any`. With the
//     `skipLibCheck: true` that virtually every app sets, the consumer sees no
//     diagnostic at all: the package looks typed and checks nothing.
//
// Both are the same defect. Qualifying the specifier fixes both: node16 maps
// `./options.js` back to `./options.d.ts`, and bundler mode resolves it too.
//
// The rewrite is FILESYSTEM-VERIFIED, never textual guesswork: a specifier is
// only rewritten to a path that actually exists in the emitted output, and an
// unresolvable specifier is a hard failure rather than a silent pass-through.
//
// Usage:
//   node tooling/qualify-dts-specifiers.mjs dist [more-dirs...]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DECLARATION_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];

// The JS extension a declaration file is imported through, per declaration kind.
// node16 maps the JS specifier back to the declaration: `./x.js` → `x.d.ts`.
const JS_EXTENSION_FOR = { ".d.ts": ".js", ".d.mts": ".mjs", ".d.cts": ".cjs" };

// Specifiers that already carry one of these are left alone — they either
// already resolve (`./x.js`) or are not ours to rewrite (`./T.svelte`, a JSON
// import, a bare package name).
const ALREADY_QUALIFIED = /\.(js|mjs|cjs|json|svelte|vue|css)$/;

function declarationFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (DECLARATION_SUFFIXES.some((suffix) => entry.endsWith(suffix))) found.push(full);
    }
  };
  walk(dir);
  return found;
}

// Strip comments so a `from './x'` inside JSDoc is never mistaken for a real
// specifier. Positions are preserved (comments become same-length blanks) so the
// stripped copy can be used to locate specifiers in the ORIGINAL text.
function blankComments(text) {
  const blank = (match) => match.replace(/[^\n]/g, " ");
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(?<!\/)\/\/(?!\/)[^\n]*/g, blank);
}

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g;

/**
 * Resolve `specifier` as node16/nodenext would from `fromFile`, and return the
 * qualified specifier to write in its place — or `null` when nothing on disk
 * backs it.
 */
function qualify(fromFile, specifier) {
  const fromDir = path.dirname(fromFile);
  const target = path.resolve(fromDir, specifier);
  for (const suffix of DECLARATION_SUFFIXES) {
    if (existsSync(target + suffix)) return specifier + JS_EXTENSION_FOR[suffix];
  }
  for (const suffix of DECLARATION_SUFFIXES) {
    if (existsSync(path.join(target, "index" + suffix))) {
      return specifier.replace(/\/$/, "") + "/index" + JS_EXTENSION_FOR[suffix];
    }
  }
  return null;
}

/** Rewrite one declaration file in place. Returns { rewrites, unresolved }. */
export function qualifyDeclarationFile(file) {
  const original = readFileSync(file, "utf8");
  const scannable = blankComments(original);
  const edits = [];
  const unresolved = [];

  for (const match of scannable.matchAll(SPECIFIER)) {
    const specifier = match[3];
    if (!specifier.startsWith(".")) continue;
    if (ALREADY_QUALIFIED.test(specifier)) continue;
    if (DECLARATION_SUFFIXES.some((suffix) => specifier.endsWith(suffix))) continue;

    const qualified = qualify(file, specifier);
    if (qualified === null) {
      unresolved.push(specifier);
      continue;
    }
    // The quoted specifier sits after the prefix group inside the match.
    const start = match.index + match[1].length + 1;
    edits.push({ start, end: start + specifier.length, qualified });
  }

  if (edits.length > 0) {
    let out = "";
    let cursor = 0;
    for (const edit of edits) {
      out += original.slice(cursor, edit.start) + edit.qualified;
      cursor = edit.end;
    }
    out += original.slice(cursor);
    writeFileSync(file, out);
  }

  return { rewrites: edits.length, unresolved };
}

export function qualifyDeclarationDir(dir) {
  let rewrites = 0;
  const unresolved = [];
  for (const file of declarationFiles(dir)) {
    const result = qualifyDeclarationFile(file);
    rewrites += result.rewrites;
    for (const specifier of result.unresolved) unresolved.push({ file, specifier });
  }
  return { rewrites, unresolved };
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error("usage: qualify-dts-specifiers.mjs <dist-dir> [more-dirs...]");
    process.exit(1);
  }
  let failed = false;
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      console.error(`qualify-dts-specifiers: '${dir}' does not exist`);
      failed = true;
      continue;
    }
    const { rewrites, unresolved } = qualifyDeclarationDir(dir);
    if (unresolved.length > 0) {
      failed = true;
      console.error(`qualify-dts-specifiers: ${unresolved.length} unresolvable specifier(s):`);
      for (const item of unresolved) console.error(`  - ${item.file} → '${item.specifier}'`);
    }
    if (rewrites > 0) console.log(`qualify-dts-specifiers: ${dir} — ${rewrites} specifier(s)`);
  }
  if (failed) process.exit(1);
}
