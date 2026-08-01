import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_PACKAGE_ROOTS,
  PRODUCTION_CONDITIONS,
  assertPublishedFile,
  parseSpecifier,
  resolveFixtureSpecifier,
  resolvePackageExport,
  runSizeCheck,
} from "./size-check.mjs";

function makeFakePackage(root) {
  const pkgDir = path.join(root, "node-pkg");
  const distDir = path.join(pkgDir, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  const pkgJson = {
    name: "@fake/pkg",
    version: "1.0.0",
    type: "module",
    files: ["dist"],
    // Decoy fields: a resolver that falls back to dist paths or legacy fields
    // instead of the exports map would pick one of these up.
    main: "./dist/main-field.js",
    module: "./dist/module-field.js",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        development: "./dist/dev.js",
        default: "./dist/exports-entry.js",
      },
    },
  };
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(pkgJson, null, 2));
  fs.writeFileSync(
    path.join(distDir, "exports-entry.js"),
    'export const marker = "VIA_EXPORTS_MAP";\n',
  );
  fs.writeFileSync(
    path.join(distDir, "main-field.js"),
    'export const marker = "VIA_MAIN_FIELD";\n',
  );
  fs.writeFileSync(
    path.join(distDir, "module-field.js"),
    'export const marker = "VIA_MODULE_FIELD";\n',
  );
  fs.writeFileSync(path.join(distDir, "dev.js"), 'export const marker = "VIA_DEV_CONDITION";\n');
  return { pkgDir, pkgJson };
}

test("parseSpecifier splits scoped and unscoped specifiers", () => {
  assert.deepEqual(parseSpecifier("@comvi/core"), { packageName: "@comvi/core", subpath: "." });
  assert.deepEqual(parseSpecifier("@comvi/core/slim"), {
    packageName: "@comvi/core",
    subpath: "./slim",
  });
  assert.deepEqual(parseSpecifier("esbuild"), { packageName: "esbuild", subpath: "." });
});

test("resolvePackageExport picks the default condition and skips development/types in production", () => {
  const pkgJson = {
    name: "x",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        development: "./dist/dev.js",
        default: "./dist/prod.js",
      },
    },
  };
  assert.equal(resolvePackageExport(pkgJson, ".", PRODUCTION_CONDITIONS), "./dist/prod.js");
  assert.equal(resolvePackageExport(pkgJson, ".", ["development"]), "./dist/dev.js");
});

test("resolvePackageExport returns undefined for a subpath missing from the exports map", () => {
  const pkgJson = { name: "x", exports: { ".": { default: "./dist/index.js" } } };
  assert.equal(resolvePackageExport(pkgJson, "./slim", PRODUCTION_CONDITIONS), undefined);
});

test("resolvePackageExport uses the exports map, never module/main dist paths", () => {
  const pkgJson = {
    name: "x",
    main: "./dist/main-field.js",
    module: "./dist/module-field.js",
    exports: { ".": { default: "./dist/exports-entry.js" } },
  };
  assert.equal(
    resolvePackageExport(pkgJson, ".", PRODUCTION_CONDITIONS),
    "./dist/exports-entry.js",
  );
});

test("resolvePackageExport refuses packages without an exports map", () => {
  assert.throws(
    () => resolvePackageExport({ name: "x", main: "./dist/index.js" }, "."),
    /no "exports" map/,
  );
});

test("assertPublishedFile rejects targets outside the files allowlist", () => {
  const pkgJson = { name: "x", files: ["dist"] };
  assert.doesNotThrow(() => assertPublishedFile(pkgJson, "./dist/index.js"));
  assert.throws(
    () => assertPublishedFile(pkgJson, "./src/index.ts"),
    /outside the published "files" allowlist/,
  );
});

test("resolveFixtureSpecifier resolves @comvi/core through its published exports map", () => {
  const corePkg = JSON.parse(
    fs.readFileSync(path.join(DEFAULT_PACKAGE_ROOTS["@comvi/core"], "package.json"), "utf8"),
  );
  const expected = path.resolve(
    DEFAULT_PACKAGE_ROOTS["@comvi/core"],
    resolvePackageExport(corePkg, ".", PRODUCTION_CONDITIONS),
  );
  assert.equal(resolveFixtureSpecifier("@comvi/core", DEFAULT_PACKAGE_ROOTS), expected);
});

test("bundling resolves entries via the exports map, not main/module fields", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };

  const resolved = resolveFixtureSpecifier("@fake/pkg", packageRoots);
  assert.equal(resolved, path.join(pkgDir, "dist", "exports-entry.js"));

  const fixturesDir = path.join(root, "fixtures");
  fs.mkdirSync(fixturesDir);
  fs.writeFileSync(
    path.join(fixturesDir, "entry.ts"),
    'import { marker } from "@fake/pkg";\nconsole.log(marker);\n',
  );
  const budgets = {
    fixtures: [{ name: "fake", entry: "@fake/pkg", fixture: "entry.ts", gzipBudgetBytes: 1024 }],
  };
  const results = await runSizeCheck({ budgets, fixturesDir, packageRoots });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "pass");
  // The exports-map target is tiny; the decoys are equally tiny, so size alone
  // cannot distinguish them — the resolved-path assertion above is the gate.
  assert.ok(results[0].gzipBytes > 0);
});

test("runSizeCheck skips pending fixtures whose subpath is not exported yet", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };
  const budgets = {
    fixtures: [
      {
        name: "future",
        entry: "@fake/pkg/slim",
        fixture: "missing.ts",
        gzipBudgetBytes: 1,
        pending: true,
      },
    ],
  };
  const results = await runSizeCheck({ budgets, fixturesDir: root, packageRoots });
  assert.deepEqual(results, [
    { name: "future", status: "pending", unresolved: ["@fake/pkg/slim"] },
  ]);
});

test("runSizeCheck fails hard when a non-pending fixture does not resolve", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const budgets = {
    fixtures: [
      { name: "broken", entry: "@fake/pkg/slim", fixture: "missing.ts", gzipBudgetBytes: 1 },
    ],
  };
  await assert.rejects(
    runSizeCheck({ budgets, fixturesDir: root, packageRoots: { "@fake/pkg": pkgDir } }),
    /do not resolve through the published exports map/,
  );
});

test("runSizeCheck reports a fail status when the budget is exceeded", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };
  const fixturesDir = path.join(root, "fixtures");
  fs.mkdirSync(fixturesDir);
  fs.writeFileSync(
    path.join(fixturesDir, "entry.ts"),
    'import { marker } from "@fake/pkg";\nconsole.log(marker);\n',
  );
  const budgets = {
    fixtures: [{ name: "fake", entry: "@fake/pkg", fixture: "entry.ts", gzipBudgetBytes: 1 }],
  };
  const results = await runSizeCheck({ budgets, fixturesDir, packageRoots });
  assert.equal(results[0].status, "fail");
});
