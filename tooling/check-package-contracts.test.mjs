import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkDistForPrivatePackageNames,
  collectDistFiles,
  collectPrivatePackageNames,
} from "./check-package-contracts.mjs";

/**
 * A minimal `packages/*` tree: just enough for the private-package-name gate
 * (and its `collectPrivatePackageNames`/`collectDistFiles` helpers) to read —
 * not a full publishable workspace, so no `npm pack` involved.
 */
function makeWorkspace(t, packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-package-contracts-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const pkg of packages) {
    const dir = path.join(root, "packages", pkg.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: pkg.name, version: pkg.version ?? "0.0.0", private: pkg.private }, null, 2)}\n`,
    );
    for (const [file, source] of Object.entries(pkg.dist ?? {})) {
      const target = path.join(dir, "dist", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
  }
  return root;
}

test("collectPrivatePackageNames finds only private: true packages, by name not hard-coding", (t) => {
  const root = makeWorkspace(t, [
    { dir: "cli", name: "@comvi/cli" },
    { dir: "typegen", name: "@comvi/typegen", private: true },
    { dir: "locale-routing", name: "@comvi/locale-routing", private: true },
    { dir: "core", name: "@comvi/core" },
  ]);

  assert.deepEqual(collectPrivatePackageNames(root), ["@comvi/locale-routing", "@comvi/typegen"]);
});

test("collectPrivatePackageNames returns nothing when no package is private", (t) => {
  const root = makeWorkspace(t, [{ dir: "cli", name: "@comvi/cli" }]);
  assert.deepEqual(collectPrivatePackageNames(root), []);
});

test("collectDistFiles walks nested dirs and excludes .map", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: {
        "index.js": "export {}",
        "index.js.map": "{}",
        "index.d.ts": "export {}",
        "core/TypeEmitter.d.ts": "export {}",
        "core/TypeEmitter.d.ts.map": "{}",
      },
    },
  ]);
  const distDir = path.join(root, "packages", "cli", "dist");

  const files = collectDistFiles(distDir).map((f) =>
    path.relative(distDir, f).split(path.sep).join("/"),
  );
  assert.deepEqual(files.sort(), ["core/TypeEmitter.d.ts", "index.d.ts", "index.js"].sort());
});

test("collectDistFiles returns nothing when dist does not exist", (t) => {
  const root = makeWorkspace(t, [{ dir: "cli", name: "@comvi/cli" }]);
  assert.deepEqual(collectDistFiles(path.join(root, "packages", "cli", "dist")), []);
});

test("checkDistForPrivatePackageNames reports the exact violation message", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: { "stale-probe.d.ts": 'import "@comvi/typegen";' },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  const errors = checkDistForPrivatePackageNames("@comvi/cli", packageDir, ["@comvi/typegen"]);
  assert.deepEqual(errors, [
    "@comvi/cli: dist/stale-probe.d.ts names workspace-private package @comvi/typegen; " +
      "it must be inlined/vendored, not imported",
  ]);
});

test("checkDistForPrivatePackageNames passes a dist with no reference to any private package", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: { "index.js": 'export const inlined = "the emitter, inlined, no import left"' },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  assert.deepEqual(
    checkDistForPrivatePackageNames("@comvi/cli", packageDir, ["@comvi/typegen"]),
    [],
  );
});

test("checkDistForPrivatePackageNames ignores .map files", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: {
        "index.js": "export {}",
        "index.js.map":
          '{"sources":["../../typegen/src/index.ts"],"sourcesContent":["import \\"@comvi/typegen\\";"]}',
      },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  assert.deepEqual(
    checkDistForPrivatePackageNames("@comvi/cli", packageDir, ["@comvi/typegen"]),
    [],
  );
});

test("checkDistForPrivatePackageNames reports one violation per offending file, across multiple private names", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "vite-plugin",
      name: "@comvi/vite-plugin",
      dist: {
        "emit.d.ts": 'import "@comvi/typegen";',
        "extract.d.ts":
          'import { SchemaParam } from "@comvi/typegen";\nimport "@comvi/locale-routing";',
        "index.js": "export {}",
      },
    },
  ]);
  const packageDir = path.join(root, "packages", "vite-plugin");

  const errors = checkDistForPrivatePackageNames("@comvi/vite-plugin", packageDir, [
    "@comvi/locale-routing",
    "@comvi/typegen",
  ]);
  assert.deepEqual(errors.sort(), [
    "@comvi/vite-plugin: dist/emit.d.ts names workspace-private package @comvi/typegen; " +
      "it must be inlined/vendored, not imported",
    "@comvi/vite-plugin: dist/extract.d.ts names workspace-private package @comvi/locale-routing; " +
      "it must be inlined/vendored, not imported",
    "@comvi/vite-plugin: dist/extract.d.ts names workspace-private package @comvi/typegen; " +
      "it must be inlined/vendored, not imported",
  ]);
});

test("checkDistForPrivatePackageNames is a no-op when there are no private packages to check for", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: { "index.js": 'import "@comvi/typegen";' },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  assert.deepEqual(checkDistForPrivatePackageNames("@comvi/cli", packageDir, []), []);
});
