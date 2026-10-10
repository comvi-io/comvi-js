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
