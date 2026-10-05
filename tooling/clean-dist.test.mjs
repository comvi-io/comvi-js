import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cleanAllDists, cleanDist } from "./clean-dist.mjs";
import { findUnreachableDistFiles } from "./pack-release.mjs";

const scriptPath = fileURLToPath(new URL("./clean-dist.mjs", import.meta.url));

function makeWorkspace(t, packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-clean-dist-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const pkg of packages) {
    const dir = path.join(root, "packages", pkg.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: pkg.name, private: pkg.private, ...pkg.manifest }, null, 2)}\n`,
    );
    for (const [file, source] of Object.entries(pkg.files ?? {})) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
  }
  return root;
}

test("cleanDist removes dist and nothing else", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      files: {
        "dist/index.js": "",
        "dist/chunks/i18n-OLD00001.js": "",
        "src/index.ts": "",
        LICENSE: "MIT",
      },
    },
  ]);
  const dir = path.join(root, "packages", "core");

  assert.equal(cleanDist(dir), true);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["LICENSE", "package.json", "src"]);
});

test("cleanDist is a no-op when there is no dist, and refuses a directory that is not a package", (t) => {
  const root = makeWorkspace(t, [{ dir: "core", name: "@comvi/core" }]);
  assert.equal(cleanDist(path.join(root, "packages", "core")), false);

  const stray = path.join(root, "not-a-package");
  fs.mkdirSync(path.join(stray, "dist"), { recursive: true });
  assert.throws(() => cleanDist(stray), /no package\.json/);
  assert.equal(fs.existsSync(path.join(stray, "dist")), true);
});

test("cleanAllDists clears every packages/* dist, private ones included", (t) => {
  const root = makeWorkspace(t, [
    { dir: "core", name: "@comvi/core", files: { "dist/index.js": "" } },
    { dir: "typegen", name: "@comvi/typegen", private: true, files: { "dist/index.js": "" } },
    { dir: "cli", name: "@comvi/cli", files: { "bin/comvi.js": "" } },
  ]);

  assert.deepEqual(cleanAllDists(root), ["core", "typegen"]);
  assert.equal(fs.existsSync(path.join(root, "packages", "core", "dist")), false);
  assert.equal(fs.existsSync(path.join(root, "packages", "typegen", "dist")), false);
  assert.equal(fs.existsSync(path.join(root, "packages", "cli", "bin", "comvi.js")), true);
});

test("the CLI cleans the dist of the package it runs in", (t) => {
  const root = makeWorkspace(t, [
    { dir: "core", name: "@comvi/core", files: { "dist/stale-OLD00001.js": "" } },
    { dir: "react", name: "@comvi/react", files: { "dist/index.js": "" } },
  ]);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(root, "packages", "core"),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, "packages", "core", "dist")), false);
  assert.equal(fs.existsSync(path.join(root, "packages", "react", "dist", "index.js")), true);
});

test("findUnreachableDistFiles reports what a turbo cache hit left behind, per publishable package", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      manifest: { exports: { ".": "./dist/index.js" } },
      files: {
        "dist/index.js": 'import "./chunks/i18n-NEW00001.js";',
        "dist/chunks/i18n-NEW00001.js": "export {};",
        // A cache hit restores the current files and deletes nothing.
        "dist/chunks/i18n-OLD00001.js": "export {};",
      },
    },
    {
      dir: "react",
      name: "@comvi/react",
      manifest: { exports: { ".": "./dist/index.js" } },
      files: { "dist/index.js": "export {};" },
    },
    {
      dir: "typegen",
      name: "@comvi/typegen",
      private: true,
      manifest: { exports: { ".": "./dist/index.js" } },
      files: { "dist/index.js": "export {};", "dist/orphan.js": "export {};" },
    },
  ]);

  const errors = findUnreachableDistFiles(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^@comvi\/core: dist\/chunks\/i18n-OLD00001\.js is packed but/);
});
