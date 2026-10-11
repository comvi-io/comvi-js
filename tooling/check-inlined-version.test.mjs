import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkInlinedVersions,
  collectVersionLiterals,
  packagesInliningVersion,
} from "./check-inlined-version.mjs";

const scriptPath = fileURLToPath(new URL("./check-inlined-version.mjs", import.meta.url));

const INLINING_CONFIG = `import pkg from "./package.json";
export default { define: { __VERSION__: JSON.stringify(pkg.version) } };
`;
const PLAIN_CONFIG = `export default { define: { __DEV__: false } };
`;

function makeWorkspace(t, packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-inlined-version-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const pkg of packages) {
    const dir = path.join(root, "packages", pkg.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: pkg.name, version: pkg.version }, null, 2)}\n`,
    );
    for (const [file, source] of Object.entries(pkg.configs ?? {})) {
      fs.writeFileSync(path.join(dir, file), source);
    }
    for (const [dependency, version] of Object.entries(pkg.installed ?? {})) {
      const target = path.join(dir, "node_modules", dependency, "package.json");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify({ name: dependency, version })}\n`);
    }
    if (pkg.dist) {
      for (const [file, source] of Object.entries(pkg.dist)) {
        const target = path.join(dir, "dist", file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, source);
      }
    }
  }
  return root;
}

test("collectVersionLiterals finds quoted semver strings, prerelease included", () => {
  assert.deepEqual(collectVersionLiterals(`const e={v:"0.5.0",i:this}`), ["0.5.0"]);
  assert.deepEqual(collectVersionLiterals(`var VERSION = '0.5.0-rc.3';`), ["0.5.0-rc.3"]);
  assert.deepEqual(collectVersionLiterals(`let a="0.4.0",b="1.2.3"`), ["0.4.0", "1.2.3"]);
  assert.deepEqual(collectVersionLiterals(`const notAVersion = "0.5"`), []);
});

test("collectVersionLiterals finds a version a minifier wrote as a template literal", () => {
  assert.deepEqual(collectVersionLiterals("var RM=`0.5.0`,zM=Symbol.for(`x`)"), ["0.5.0"]);
});

// The literal pass as it was before template literals were recognised. Whatever
// it finds, the gate must still find: the template pass may only add.
const QUOTED_ONLY = /["'](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["']/g;

const DELIMITER_CASES = [
  // A template literal whose text holds a quoted stale version: one character
  // class for all three delimiters matched `0.5.1" and swallowed the quote.
  ['const s = `0.5.1"0.5.0"`;', ["0.5.0"]],
  ["const s = `0.5.1'0.5.0'`;", ["0.5.0"]],
  ['const s = `0.5.0"0.5.1"`;', ["0.5.1"]],
  ["const s = '0.5.1`0.5.0`';", ["0.5.0"]],
  ['const s = "0.5.1`0.5.0`";', ["0.5.0"]],
  ['a="0.5.1""0.5.0"', ["0.5.1", "0.5.0"]],
  ["a='0.5.1''0.5.0'", ["0.5.1", "0.5.0"]],
  ["a=`0.5.1``0.5.0`", ["0.5.1", "0.5.0"]],
  ['a="0.5.1"`0.5.0`', ["0.5.1", "0.5.0"]],
  ["a=`0.5.1`'0.5.0'", ["0.5.1", "0.5.0"]],
  // A quote pair that does not match still counts, as it always has.
  [`a='0.4.0"'`, ["0.4.0"]],
  // A backtick closes only a backtick.
  ['a=`0.4.0"', []],
  ["a='0.4.0`", []],
];

for (const [source, expected] of DELIMITER_CASES) {
  test(`collectVersionLiterals(${source}) → ${JSON.stringify(expected)}`, () => {
    const found = collectVersionLiterals(source);
    assert.deepEqual(found, expected);
    for (const [, literal] of source.matchAll(QUOTED_ONLY)) {
      assert.ok(found.includes(literal), `${literal} was found before template literals counted`);
    }
  });
}

test("a stale quoted version inside a template literal that starts with the manifest version fails", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.1",
      configs: { "vite.config.ts": INLINING_CONFIG },
      dist: { "core.js": 'const s = `0.5.1"0.5.0"`;' },
    },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /inlines version "0\.5\.0" but the manifest says 0\.5\.1/);
  assert.match(problems[1], /no built file inlines the manifest version 0\.5\.1/);
});

const EDITOR = {
  dir: "plugin-in-context-editor",
  name: "@comvi/plugin-in-context-editor",
  version: "0.5.1",
  configs: { "vite.config.standalone.ts": INLINING_CONFIG },
};

test("a bundled dependency's own version literal passes while it is the installed version", (t) => {
  const root = makeWorkspace(t, [
    {
      ...EDITOR,
      installed: { vue: "3.5.32" },
      dist: {
        "standalone.iife.js": "var Gu=`3.5.32`,RM=`0.5.1`",
        "EditModal-abc.js": `const version = "3.5.32";`,
      },
    },
  ]);

  assert.deepEqual(checkInlinedVersions({ root, log() {} }).problems, []);
});

test("a stale own version fails next to a bundled dependency's literal", (t) => {
  const root = makeWorkspace(t, [
    {
      ...EDITOR,
      installed: { vue: "3.5.32" },
      dist: { "standalone.iife.js": "var Gu=`3.5.32`,RM=`0.5.0`" },
    },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.equal(problems.length, 2);
  assert.match(
    problems[0],
    /standalone\.iife\.js inlines version "0\.5\.0" but the manifest says 0\.5\.1/,
  );
  assert.match(problems[1], /no built file inlines the manifest version 0\.5\.1/);
});

test("a literal that is not the installed version of the bundled dependency fails", (t) => {
  const root = makeWorkspace(t, [
    {
      ...EDITOR,
      installed: { vue: "3.5.32" },
      dist: { "standalone.iife.js": "var Gu=`3.4.0`,RM=`0.5.1`" },
    },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /inlines version "3\.4\.0"/);
});

test("a bundled dependency that is not installed is reported, not waved through", (t) => {
  const root = makeWorkspace(t, [
    { ...EDITOR, dist: { "standalone.iife.js": "var Gu=`3.5.32`,RM=`0.5.1`" } },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /bundled dependency vue is not installed/);
  assert.match(problems[1], /inlines version "3\.5\.32"/);
});

test("the bundled-dependency record is per package: another package's same literal still fails", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.1",
      configs: { "vite.config.ts": INLINING_CONFIG },
      installed: { vue: "3.5.32" },
      dist: { "core.js": `const a="0.5.1",b="3.5.32"` },
    },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /@comvi\/core: dist\/core\.js inlines version "3\.5\.32"/);
});

test("discovery only picks packages whose vite config defines __VERSION__", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.0",
      configs: { "vite.config.ts": INLINING_CONFIG, "vite.config.umd.ts": INLINING_CONFIG },
      dist: { "core.js": `const e={v:"0.5.0"}` },
    },
    {
      dir: "vue",
      name: "@comvi/vue",
      version: "0.5.0",
      configs: { "vite.config.ts": PLAIN_CONFIG },
      dist: { "vue.js": `const stale="0.4.0"` },
    },
  ]);

  assert.deepEqual(
    packagesInliningVersion(root).map((pkg) => [pkg.name, pkg.configs]),
    [["@comvi/core", ["vite.config.ts", "vite.config.umd.ts"]]],
  );
  assert.deepEqual(checkInlinedVersions({ root, log() {} }).problems, []);
});

test("a dist built before a version rewrite fails the gate", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.0-rc.0",
      configs: { "vite.config.ts": INLINING_CONFIG },
      dist: {
        "comvi-core-devtools.js": `const e={v:"0.4.0",i:this}`,
        "comvi-core-devtools.dev.js": `var VERSION = "0.4.0";`,
      },
    },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.equal(problems.length, 3);
  assert.match(
    problems[0],
    /@comvi\/core: dist\/comvi-core-devtools\.dev\.js inlines version "0\.4\.0" but the manifest says 0\.5\.0-rc\.0/,
  );
  assert.match(problems[1], /dist\/comvi-core-devtools\.js inlines version "0\.4\.0"/);
  assert.match(problems[2], /no built file inlines the manifest version 0\.5\.0-rc\.0/);
});

test("a partially stale dist fails even though one file matches", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.0",
      configs: { "vite.config.ts": INLINING_CONFIG },
      dist: {
        "comvi-core-devtools.js": `const e={v:"0.5.0",i:this}`,
        "comvi-core.global.prod.js": `let r={v:"0.4.0",i:this}`,
      },
    },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /comvi-core\.global\.prod\.js inlines version "0\.4\.0"/);
});

test("an rc dist that matches its rewritten manifest passes", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.0-rc.0",
      configs: { "vite.config.ts": INLINING_CONFIG },
      dist: {
        "comvi-core-devtools.js": `const e={v:"0.5.0-rc.0",i:this}`,
        "nested/chunk.js": `export const noVersionHere = 1;`,
      },
    },
  ]);

  assert.deepEqual(checkInlinedVersions({ root, log() {} }).problems, []);
});

test("a missing dist is reported rather than silently passing", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.0",
      configs: { "vite.config.ts": INLINING_CONFIG },
    },
  ]);

  const { problems } = checkInlinedVersions({ root, log() {} });
  assert.deepEqual(problems, ["@comvi/core: no dist/ to check — run the build before this gate"]);
});

test("a workspace where nothing inlines __VERSION__ is reported, not passed", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "vue",
      name: "@comvi/vue",
      version: "0.5.0",
      configs: { "vite.config.ts": PLAIN_CONFIG },
      dist: { "vue.js": "export const x = 1;" },
    },
  ]);

  assert.deepEqual(checkInlinedVersions({ root, log() {} }).problems, [
    "no package inlines __VERSION__ — this gate has nothing to check",
  ]);
});

test("the CLI exits 1 on a stale dist and 0 on a fresh one", (t) => {
  const stale = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.0",
      configs: { "vite.config.ts": INLINING_CONFIG },
      dist: { "comvi-core-devtools.js": `const e={v:"0.4.0"}` },
    },
  ]);
  const failed = spawnSync(process.execPath, [scriptPath], { cwd: stale, encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /check-inlined-version: @comvi\/core: /);

  const fresh = makeWorkspace(t, [
    {
      dir: "core",
      name: "@comvi/core",
      version: "0.5.0",
      configs: { "vite.config.ts": INLINING_CONFIG },
      dist: { "comvi-core-devtools.js": `const e={v:"0.5.0"}` },
    },
  ]);
  const passed = spawnSync(process.execPath, [scriptPath], { cwd: fresh, encoding: "utf8" });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /@comvi\/core dist inlines 0\.5\.0 \(1 occurrence\)/);
});
