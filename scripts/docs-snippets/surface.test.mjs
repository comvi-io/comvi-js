/**
 * Tests for the package-surface reader and for the one lint rule that consumes
 * it, `banned/unresolved-comvi-import`.
 *
 * Both live here on purpose. They are a single mechanism — resolve a specifier
 * against an `exports` map, resolve a name against the source the entry is
 * built from — and they share one fixture: a miniature `packages/` tree on
 * disk, because reading the filesystem IS what this rule does and a mocked
 * surface would test the mock.
 *
 * The tree mirrors the real repo only where the shape matters: `@comvi/core`
 * with a root and the `./loader` and `./icu` subpaths, `@comvi/plugin-fetch-loader`
 * with a root and `./cdn`, and `@comvi/nuxt` with a default export. Mirroring it
 * rather than using the live packages keeps these tests about the MECHANISM —
 * they must not start failing the next time a symbol legitimately moves. The
 * live surface is asserted separately, and narrowly, at the bottom.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintDocument, parseFenceImports } from "./lint.mjs";
import {
  entrySourceFile,
  loadRepoSurface,
  parseModuleExports,
  splitSpecifier,
} from "./surface.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function manifest(name, exported) {
  return JSON.stringify({ name, version: "0.5.0", exports: exported }, null, 2);
}

/**
 * A miniature `packages/` tree with every shape the rule has to answer for.
 *
 * `@comvi/core`'s root exports `flattenCatalog` and its `./loader` does not —
 * the exact split that shipped broken — and `@comvi/plugin-fetch-loader` has it
 * the other way round: `CdnLoader` lives on the `./cdn` subpath and not on the
 * root.
 */
function makeSurfaceRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-snippets-surface-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const core = path.join(root, "packages/core");
  write(
    path.join(core, "package.json"),
    manifest("@comvi/core", {
      ".": {
        types: "./dist/index.d.ts",
        development: "./dist/comvi-core.dev.js",
        default: "./dist/comvi-core.js",
      },
      "./loader": { types: "./dist/loader.d.ts", default: "./dist/comvi-core-loader.js" },
      "./icu": { types: "./dist/icu.d.ts", default: "./dist/comvi-core-icu.js" },
    }),
  );
  write(
    path.join(core, "src/index.ts"),
    [
      "// A doc comment showing the API must not read as a re-export:",
      '// export { phantomFromAComment } from "./nowhere";',
      "/**",
      ' * export { alsoPhantom } from "./nowhere";',
      " */",
      'export { normalizeTranslationObject as flattenCatalog } from "./utils";',
      "export function createI18n() {}",
      "export const REVISION_EVENTS = [];",
      'export type * from "./types";',
      "",
    ].join("\n"),
  );
  write(path.join(core, "src/utils.ts"), "export function normalizeTranslationObject() {}\n");
  write(
    path.join(core, "src/types.ts"),
    ["export type I18n = { locale: string };", "export type TranslationValue = string;", ""].join(
      "\n",
    ),
  );
  write(
    path.join(core, "src/loader.ts"),
    [
      "// `flattenCatalog` is NOT here: it stays published from the root.",
      'export { attachLoader } from "./core/loader";',
      "export function loader() {}",
      'export type { LoaderFn } from "./types-loader";',
      "",
    ].join("\n"),
  );
  write(path.join(core, "src/core/loader.ts"), "export function attachLoader() {}\n");
  write(path.join(core, "src/types-loader.ts"), "export type LoaderFn = () => void;\n");
  write(path.join(core, "src/icu.ts"), "export const icuCompiler = {};\n");

  const fetchLoader = path.join(root, "packages/plugin-fetch-loader");
  write(
    path.join(fetchLoader, "package.json"),
    manifest("@comvi/plugin-fetch-loader", {
      ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      "./cdn": { types: "./dist/cdn.d.ts", default: "./dist/cdn.js" },
    }),
  );
  write(
    path.join(fetchLoader, "src/index.ts"),
    ["export class FetchLoader {}", "export function fetchLoader() {}", ""].join("\n"),
  );
  // A directory index, the way `@comvi/plugin-fetch-loader/cdn` really is built.
  write(
    path.join(fetchLoader, "src/cdn/index.ts"),
    ["export class CdnLoader {}", "export function cdnLoader() {}", ""].join("\n"),
  );

  const nuxt = path.join(root, "packages/nuxt");
  write(
    path.join(nuxt, "package.json"),
    manifest("@comvi/nuxt", {
      ".": { types: "./dist/module.d.mts", import: "./dist/module.mjs" },
      "./runtime/*": "./dist/runtime/*",
    }),
  );
  write(
    path.join(nuxt, "src/module.ts"),
    ["export default function comviNuxtModule() {}", "export type ModuleOptions = {};", ""].join(
      "\n",
    ),
  );

  // A package whose root star-re-exports something OUTSIDE the repo: its
  // surface is a lower bound and must never yield a missing-name verdict.
  const open = path.join(root, "packages/react");
  write(
    path.join(open, "package.json"),
    manifest("@comvi/react", { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } }),
  );
  write(
    path.join(open, "src/index.ts"),
    [
      "export { I18nProvider } from './I18nProvider';",
      'export * from "some-npm-package";',
      "",
    ].join("\n"),
  );
  write(path.join(open, "src/I18nProvider.ts"), "export function I18nProvider() {}\n");

  return root;
}

function surfaceOf(t) {
  return loadRepoSurface(makeSurfaceRoot(t));
}

/** Lint one fenced body against a surface; returns the findings. */
function findingsOf(body, surface, { file = "packages/core/README.md" } = {}) {
  return lintDocument({ file, source: `# Page\n\n${body}\n`, surface }).findings;
}

/** Only the import-resolution findings, as `line:col rule → message` strings. */
function importFindings(body, surface, options) {
  return findingsOf(body, surface, options)
    .filter((finding) => finding.rule === "banned/unresolved-comvi-import")
    .map((finding) => `${finding.line}:${finding.col} ${finding.message}`);
}

function fence(...lines) {
  return ["```ts", ...lines, "```"].join("\n");
}

// ---------------------------------------------------------------------------
// The shipped shape: a name that exists on the ROOT, imported from a SUBPATH.
// ---------------------------------------------------------------------------

test("a root export imported from a subpath → flagged, and told where it lives", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(
    fence('import { flattenCatalog } from "@comvi/core/loader";'),
    surface,
  );

  assert.equal(findings.length, 1);
  assert.match(findings[0], /^4:10 /);
  assert.match(findings[0], /@comvi\/core\/loader has no export named flattenCatalog/);
  assert.match(findings[0], /It is exported from @comvi\/core — import it from there\./);
});

test("the same split the other way round: a subpath export imported from the root", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(
    fence('import { CdnLoader } from "@comvi/plugin-fetch-loader";'),
    surface,
  );

  assert.equal(findings.length, 1);
  assert.match(findings[0], /@comvi\/plugin-fetch-loader has no export named CdnLoader/);
  assert.match(findings[0], /exported from @comvi\/plugin-fetch-loader\/cdn/);
});

test("a name no @comvi entry point exports → flagged, and says so rather than guessing", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(fence('import { notAThing } from "@comvi/core";'), surface);

  assert.equal(findings.length, 1);
  assert.match(findings[0], /no @comvi\/\* entry point in this repo exports that name\.$/);
});

// ---------------------------------------------------------------------------
// Import shapes.
// ---------------------------------------------------------------------------

test("a named value import that resolves → clean; the broken one beside it is the only finding", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(
    fence(
      'import { createI18n } from "@comvi/core";',
      'import { loader, attachLoader } from "@comvi/core/loader";',
      'import { gone } from "@comvi/core";',
    ),
    surface,
  );

  assert.equal(findings.length, 1);
  assert.match(findings[0], /^6:10 .*@comvi\/core has no export named gone/);
});

test("a named TYPE import: resolved as a type, and flagged by name when absent", (t) => {
  const surface = surfaceOf(t);

  assert.deepEqual(
    importFindings(
      fence(
        'import type { LoaderFn } from "@comvi/core/loader";',
        'import type { I18n } from "@comvi/core";',
        'import { loader, type LoaderFn as Fn } from "@comvi/core/loader";',
      ),
      surface,
    ),
    [],
  );

  const findings = importFindings(
    fence('import type { flattenCatalog } from "@comvi/core/loader";'),
    surface,
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^4:15 .*@comvi\/core\/loader has no export named flattenCatalog/);
});

test("a value import of a TYPE-ONLY export → flagged; `import type` of a value is not", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(fence('import { LoaderFn } from "@comvi/core/loader";'), surface);

  assert.equal(findings.length, 1);
  assert.match(findings[0], /LoaderFn is a type-only export of @comvi\/core\/loader/);
  assert.match(findings[0], /import type \{ LoaderFn \}/);

  // The other direction is legal TypeScript and must stay silent.
  assert.deepEqual(
    importFindings(fence('import type { createI18n } from "@comvi/core";'), surface),
    [],
  );
});

test("a default import: allowed where there is a default export, flagged where there is not", (t) => {
  const surface = surfaceOf(t);

  assert.deepEqual(importFindings(fence('import comviNuxt from "@comvi/nuxt";'), surface), []);

  const findings = importFindings(fence('import core from "@comvi/core";'), surface);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^4:8 .*@comvi\/core has no default export\.$/);
});

test("a namespace import: no name to check, but the specifier still is", (t) => {
  const surface = surfaceOf(t);

  assert.deepEqual(
    importFindings(
      fence(
        'import * as coreLoader from "@comvi/core/loader";',
        'import comviNuxt, * as nuxt from "@comvi/nuxt";',
      ),
      surface,
    ),
    [],
  );

  const findings = importFindings(fence('import * as nope from "@comvi/core/nope";'), surface);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /@comvi\/core has no "\.\/nope" entry/);
});

test("a subpath specifier resolves through its own entry source, index files included", (t) => {
  const surface = surfaceOf(t);

  assert.deepEqual(
    importFindings(
      fence(
        'import { icuCompiler } from "@comvi/core/icu";',
        'import { cdnLoader, CdnLoader } from "@comvi/plugin-fetch-loader/cdn";',
        'import { defineComviSetup } from "@comvi/nuxt/runtime/setup";',
      ),
      surface,
    ),
    [],
  );
});

test("a specifier absent from the exports map → flagged, with the map's published entries", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(
    fence('import { icuCompiler } from "@comvi/core/compiler";', 'import "@comvi/core/tags";'),
    surface,
  );

  assert.equal(findings.length, 2);
  assert.match(findings[0], /^4:1 .*@comvi\/core has no "\.\/compiler" entry/);
  assert.match(findings[0], /Its exports map publishes \., \.\/icu, \.\/loader\.$/);
  assert.match(findings[1], /^5:1 import "@comvi\/core\/tags" — @comvi\/core has no "\.\/tags"/);
});

test("an unknown @comvi package → flagged as absent from packages/*", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(fence('import { thing } from "@comvi/nope";'), surface);

  assert.equal(findings.length, 1);
  assert.match(findings[0], /there is no @comvi\/nope package in this repo/);
});

test("a dynamic import()'s specifier is resolved too", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(fence('const mod = await import("@comvi/core/nope");'), surface);

  assert.equal(findings.length, 1);
  assert.match(findings[0], /@comvi\/core has no "\.\/nope" entry/);
});

// ---------------------------------------------------------------------------
// What the rule must NOT do. Each of these pairs the silent case with a live
// finding, so the assertion cannot be satisfied by a rule that reports nothing.
// ---------------------------------------------------------------------------

test("a non-comvi specifier is never resolved, however wrong it looks", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(
    fence(
      'import React, { useMemo } from "react";',
      'import clsx from "clsx";',
      'import { loadTranslations } from "@/i18n/server";',
      'import { flattenCatalog } from "@comvi/core/loader";',
    ),
    surface,
  );

  assert.equal(findings.length, 1);
  assert.match(findings[0], /^7:10 .*@comvi\/core\/loader has no export named flattenCatalog/);
});

test("a fence the extractor skips is not resolved — check=skip, and a foreign-import fence", (t) => {
  const surface = surfaceOf(t);

  const body = [
    "```ts check=skip:historical-0.4",
    'import { flattenCatalog } from "@comvi/core/loader";',
    "```",
    "",
    "```ts",
    'import { useTranslations } from "next-intl";',
    'import { flattenCatalog } from "@comvi/core/loader";',
    "```",
    "",
    "```ts",
    'import { flattenCatalog } from "@comvi/core/loader";',
    "```",
  ].join("\n");

  const findings = importFindings(body, surface);

  // Only the third fence: the first is skipped by `check=skip`, the second by
  // the foreign-import rule that skips a competitor's code wholesale.
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^13:10 /);
});

test("a diff fence's removed line is the BEFORE state and is not resolved; the added one is", (t) => {
  const surface = surfaceOf(t);

  const body = [
    "```diff",
    '-import { flattenCatalog } from "@comvi/core/loader";',
    '+import { flattenCatalog } from "@comvi/core";',
    '+import { alsoGone } from "@comvi/core";',
    "```",
  ].join("\n");

  const findings = importFindings(body, surface);

  assert.equal(findings.length, 1);
  assert.match(findings[0], /@comvi\/core has no export named alsoGone/);
});

test("a commented-out import is prose about an import, not an import", (t) => {
  const surface = surfaceOf(t);

  const findings = importFindings(
    fence(
      '// import { flattenCatalog } from "@comvi/core/loader";',
      '  // import { alsoGone } from "@comvi/core";',
      '/* import { andThis } from "@comvi/core"; */',
      'import { stillBroken } from "@comvi/core";',
    ),
    surface,
  );

  assert.equal(findings.length, 1);
  assert.match(findings[0], /@comvi\/core has no export named stillBroken/);
});

test("an OPEN surface yields no missing-name verdict, but still resolves specifiers", (t) => {
  const surface = surfaceOf(t);

  // `@comvi/react`'s root star-re-exports an npm package, so its name set is a
  // lower bound: a name this module cannot see must not be called absent.
  assert.deepEqual(
    importFindings(fence('import { somethingFromNpm } from "@comvi/react";'), surface),
    [],
  );
  assert.equal(surface.resolve("@comvi/react").closed, false);

  // The exports MAP is complete whatever the sources do, so a bad subpath on
  // the same package is still a finding.
  const findings = importFindings(fence('import { anything } from "@comvi/react/hooks";'), surface);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /@comvi\/react has no "\.\/hooks" entry/);
});

test("no surface → the rule is inert, which is what the www copy runs", (t) => {
  const surface = surfaceOf(t);
  const body = fence('import { flattenCatalog } from "@comvi/core/loader";');

  assert.equal(importFindings(body, surface).length, 1);
  assert.deepEqual(importFindings(body, undefined), []);
  assert.equal(loadRepoSurface(path.join(os.tmpdir(), "docs-snippets-no-such-root")), null);
});

// ---------------------------------------------------------------------------
// surface.mjs units.
// ---------------------------------------------------------------------------

test("splitSpecifier separates the scoped package name from the subpath", () => {
  assert.deepEqual(splitSpecifier("@comvi/core"), { name: "@comvi/core", subpath: "." });
  assert.deepEqual(splitSpecifier("@comvi/core/loader"), {
    name: "@comvi/core",
    subpath: "./loader",
  });
  assert.deepEqual(splitSpecifier("@comvi/nuxt/runtime/composables/useI18n"), {
    name: "@comvi/nuxt",
    subpath: "./runtime/composables/useI18n",
  });
  assert.equal(splitSpecifier("react"), null);
  assert.equal(splitSpecifier("@comvi/"), null);
  assert.equal(splitSpecifier("@comvi"), null);
});

test("entrySourceFile inverts the build: dist target → src module, index or opaque", (t) => {
  const root = makeSurfaceRoot(t);
  const core = path.join(root, "packages/core");
  const fetchLoader = path.join(root, "packages/plugin-fetch-loader");

  assert.equal(entrySourceFile(core, "./dist/loader.d.ts"), path.join(core, "src/loader.ts"));
  assert.equal(entrySourceFile(core, "./dist/index.d.ts"), path.join(core, "src/index.ts"));
  assert.equal(
    entrySourceFile(path.join(root, "packages/nuxt"), "./dist/module.d.mts"),
    path.join(root, "packages/nuxt/src/module.ts"),
  );
  assert.equal(
    entrySourceFile(fetchLoader, "./dist/cdn.d.ts"),
    path.join(fetchLoader, "src/cdn/index.ts"),
  );
  // A build infix is peeled off; a target nothing was built from is OPAQUE.
  assert.equal(entrySourceFile(core, "./dist/index.es.js"), path.join(core, "src/index.ts"));
  assert.equal(entrySourceFile(core, "./dist/comvi-core.dev.js"), null);
  assert.equal(entrySourceFile(core, "./dist/runtime/*"), null);
  assert.equal(entrySourceFile(core, null), null);
});

test("parseModuleExports reads every export shape, and no comment", () => {
  const parsed = parseModuleExports(
    [
      '// export { fromALineComment } from "./x";',
      "/**",
      ' * export { fromABlockComment } from "./x";',
      " */",
      "export const value = 1;",
      "export function fn() {}",
      "export class Klass {}",
      "export enum Enum {}",
      "export type Alias = string;",
      "export interface Shape {}",
      "export declare const declared: string;",
      'export { a, b as c, type D, type E as F } from "./x";',
      'export type { G, H as I } from "./y";',
      "export { localValue, type LocalType };",
      'export * from "./star";',
      'export type * from "./type-star";',
      'export * as ns from "./namespace";',
      'export { default as Renamed } from "./default";',
      "export default function main() {}",
      "",
    ].join("\n"),
  );

  const kinds = (name) => {
    const flags = parsed.local.get(name);
    return flags === undefined ? "absent" : `${flags.value ? "v" : ""}${flags.type ? "t" : ""}`;
  };

  assert.equal(kinds("fromALineComment"), "absent");
  assert.equal(kinds("fromABlockComment"), "absent");
  assert.equal(kinds("value"), "v");
  assert.equal(kinds("fn"), "v");
  assert.equal(kinds("Klass"), "vt");
  assert.equal(kinds("Enum"), "vt");
  assert.equal(kinds("Alias"), "t");
  assert.equal(kinds("Shape"), "t");
  assert.equal(kinds("declared"), "v");
  assert.equal(kinds("a"), "vt");
  assert.equal(kinds("c"), "vt");
  assert.equal(kinds("b"), "absent");
  assert.equal(kinds("D"), "t");
  assert.equal(kinds("F"), "t");
  assert.equal(kinds("G"), "t");
  assert.equal(kinds("I"), "t");
  assert.equal(kinds("localValue"), "vt");
  assert.equal(kinds("LocalType"), "t");
  assert.equal(kinds("ns"), "vt");
  assert.equal(kinds("Renamed"), "vt");
  assert.equal(parsed.hasDefault, true);
  assert.deepEqual(parsed.stars, [
    { specifier: "./star", typeOnly: false },
    { specifier: "./type-star", typeOnly: true },
  ]);
});

test("re-exports are followed transitively, and `export type *` downgrades to types", (t) => {
  const surface = surfaceOf(t);

  const core = surface.resolve("@comvi/core");
  assert.equal(core.status, "ok");
  assert.equal(core.closed, true);
  // Two hops: root → `./utils` for the alias, root → `./types` for the types.
  assert.deepEqual(core.names.get("flattenCatalog"), { value: true, type: true });
  assert.deepEqual(core.names.get("I18n"), { value: false, type: true });
  assert.deepEqual(core.names.get("TranslationValue"), { value: false, type: true });

  const loaderEntry = surface.resolve("@comvi/core/loader");
  assert.equal(loaderEntry.names.has("flattenCatalog"), false);
  assert.deepEqual(loaderEntry.names.get("attachLoader"), { value: true, type: true });
  assert.deepEqual(loaderEntry.names.get("LoaderFn"), { value: false, type: true });
});

test("whereIs names the entry points that export a symbol, its own package first", (t) => {
  const surface = surfaceOf(t);

  assert.deepEqual(
    surface.whereIs("flattenCatalog", "@comvi/core").map((hit) => hit.specifier),
    ["@comvi/core"],
  );
  assert.deepEqual(
    surface.whereIs("CdnLoader", "@comvi/plugin-fetch-loader").map((hit) => hit.specifier),
    ["@comvi/plugin-fetch-loader/cdn"],
  );
  assert.deepEqual(surface.whereIs("nothingExportsThis", "@comvi/core"), []);
});

// ---------------------------------------------------------------------------
// parseFenceImports — the doc side of the resolution.
// ---------------------------------------------------------------------------

test("parseFenceImports splits two statements sharing a line", () => {
  const statements = parseFenceImports(
    'import React from "react"; import { useI18n } from "@comvi/react";',
  );

  assert.deepEqual(
    statements.map((statement) => statement.specifier),
    ["react", "@comvi/react"],
  );
  assert.equal(statements[0].defaultBinding?.typeOnly, false);
  assert.deepEqual(
    statements[1].names.map((name) => name.imported),
    ["useI18n"],
  );
});

test("parseFenceImports keeps a wrapped clause whole and marks inline type bindings", () => {
  const statements = parseFenceImports(
    ["import {", "  createI18n,", "  type I18nOptions,", '} from "@comvi/core";'].join("\n"),
  );

  assert.equal(statements.length, 1);
  assert.deepEqual(
    statements[0].names.map((name) => [name.imported, name.typeOnly]),
    [
      ["createI18n", false],
      ["I18nOptions", true],
    ],
  );
});

test("parseFenceImports reads a re-export and a side-effect import", () => {
  assert.deepEqual(
    parseFenceImports('export { loader } from "@comvi/core/loader";').map((s) => [
      s.keyword,
      s.specifier,
      s.names.map((n) => n.imported),
    ]),
    [["export", "@comvi/core/loader", ["loader"]]],
  );
  assert.deepEqual(
    parseFenceImports('import "@comvi/core/tags";').map((s) => [s.specifier, s.names.length]),
    [["@comvi/core/tags", 0]],
  );
  // Not imports: a declaration and a default export both start with `export`.
  assert.deepEqual(parseFenceImports("export const x = 1;\nexport default foo;"), []);
});

// ---------------------------------------------------------------------------
// The live surface. Narrow on purpose: two facts, both of which are the gap.
// ---------------------------------------------------------------------------

test("the real repo surface: flattenCatalog is on @comvi/core and not on @comvi/core/loader", () => {
  const surface = loadRepoSurface(REPO);
  assert.notEqual(surface, null);

  const root = surface.resolve("@comvi/core");
  const loaderEntry = surface.resolve("@comvi/core/loader");
  assert.equal(root.status, "ok");
  assert.equal(loaderEntry.status, "ok");
  assert.equal(root.names.get("flattenCatalog")?.value, true);
  assert.equal(loaderEntry.names.has("flattenCatalog"), false);
});

test("the real repo surface reads every package, and every entry point is CLOSED", () => {
  const surface = loadRepoSurface(REPO);

  assert.ok(surface.packageNames().includes("@comvi/core"));
  assert.ok(surface.packageNames().includes("@comvi/nuxt"));

  // An OPEN or OPAQUE entry silently disables the missing-name half of the rule
  // for everything imported from it, so the gate's REACH is the thing to assert:
  // every named entry point of every package resolves to a source this module
  // read to the end. The day a package star-re-exports an external module, or is
  // built some way `entrySourceFile` does not model, this test names it instead
  // of the rule quietly going half-blind on that entry.
  const specifiers = surface.entrySpecifiers();
  assert.ok(specifiers.includes("@comvi/core/loader"));
  assert.ok(specifiers.includes("@comvi/plugin-fetch-loader/cdn"));

  const unreadable = [];
  for (const specifier of specifiers) {
    const entry = surface.resolve(specifier);
    if (entry.status !== "ok") unreadable.push(`${specifier}: ${entry.status}`);
    else if (!entry.closed) unreadable.push(`${specifier}: open`);
  }
  assert.deepEqual(unreadable, []);
});
