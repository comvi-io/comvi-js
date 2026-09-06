import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertLocalResolutions,
  declaredComviDeps,
  entryChunk,
  parseArgs,
  provenanceLine,
  withOverrides,
} from "./examples-verify.mjs";

/**
 * The pure helpers only. The install/build path is not tested here: it packs
 * fourteen tarballs and runs five real installs, and a test that fakes those
 * would assert the fake. `pnpm examples:verify` is that path's own gate
 * (CONTRIBUTING gate 7).
 */

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

/** A `packages` entry with its tarball really on disk, which `tarballFor` requires. */
function fakePackage(root, name, version) {
  const dir = path.join(root, name.replace("@comvi/", ""));
  fs.mkdirSync(dir, { recursive: true });
  const bare = name.replace(/^@/, "").replace("/", "-");
  fs.writeFileSync(path.join(dir, `${bare}-${version}.tgz`), "");
  return { name, version, dir };
}

test("assertLocalResolutions accepts a lockfile whose @comvi entries are all file: tarballs", () => {
  const lockfile = [
    "overrides:",
    "  '@comvi/core': file:/tmp/comvi-core-0.5.0.tgz",
    "packages:",
    "  '@comvi/core@file:../../../packages/core/comvi-core-0.5.0.tgz':",
    "    resolution: {}",
    "  '@comvi/react@file:../../../packages/react/comvi-react-0.5.0.tgz':",
    "    resolution: {}",
  ].join("\n");

  assert.doesNotThrow(() => assertLocalResolutions(lockfile, ["@comvi/core", "@comvi/react"]));
});

test("assertLocalResolutions throws when one @comvi package resolved from the registry", () => {
  // The exact shape that shipped a green gate against the PREVIOUS release:
  // `pnpm pack` rewrote `workspace:*` to `0.4.0`, and the peer was fetched from
  // npm while every direct dependency came from a tarball.
  const lockfile = [
    "packages:",
    "  '@comvi/core@0.4.0':",
    "    resolution: {}",
    "  '@comvi/react@file:../../../packages/react/comvi-react-0.5.0.tgz':",
    "    resolution: {}",
  ].join("\n");

  assert.throws(() => assertLocalResolutions(lockfile, ["@comvi/react"]), {
    message: /1 @comvi resolution\(s\) came from the registry.*@comvi\/core@0\.4\.0/s,
  });
});

test("assertLocalResolutions fails closed on a lockfile it cannot parse", () => {
  // Zero parsed entries means zero strays, which would read as "provenance
  // clean" while nothing was ever checked. It has to be an error instead.
  const lockfile = "{ this is not a pnpm lockfile }";

  assert.throws(() => assertLocalResolutions(lockfile, ["@comvi/core"]), {
    message: /names no resolution for @comvi\/core.*never checked/s,
  });
});

test("withOverrides pins every workspace package without touching the declared ranges", () => {
  const root = tempDir("comvi-verify-overrides-");
  const packages = [
    fakePackage(root, "@comvi/core", "0.5.0"),
    fakePackage(root, "@comvi/react", "0.5.0"),
  ];
  const manifest = {
    name: "comvi-example-react",
    dependencies: { "@comvi/react": "^0.5.0", react: "^19.2.4" },
  };

  const result = withOverrides(manifest, packages);

  assert.deepEqual(result.dependencies, { "@comvi/react": "^0.5.0", react: "^19.2.4" });
  assert.equal(
    result.pnpm.overrides["@comvi/core"],
    `file:${path.join(root, "core", "comvi-core-0.5.0.tgz")}`,
  );
  assert.equal(
    result.pnpm.overrides["@comvi/react"],
    `file:${path.join(root, "react", "comvi-react-0.5.0.tgz")}`,
  );
});

test("withOverrides pins packages the example does not depend on, so transitives resolve locally", () => {
  const root = tempDir("comvi-verify-transitive-");
  const packages = [fakePackage(root, "@comvi/core", "0.5.0")];
  const manifest = { dependencies: { "@comvi/react": "^0.5.0" } };

  const result = withOverrides(manifest, packages);

  assert.ok("@comvi/core" in result.pnpm.overrides);
});

test("declaredComviDeps reads both pools and ignores everything outside the scope", () => {
  const manifest = {
    dependencies: { "@comvi/react": "^0.5.0", "@comvi/core": "^0.5.0", react: "^19.2.4" },
    devDependencies: { "@comvi/vite-plugin": "^0.5.0", vite: "^8.0.3" },
  };

  assert.deepEqual(declaredComviDeps(manifest), [
    "@comvi/core",
    "@comvi/react",
    "@comvi/vite-plugin",
  ]);
});

test("declaredComviDeps returns nothing for a manifest with no dependency pools", () => {
  assert.deepEqual(declaredComviDeps({ name: "x" }), []);
});

test("entryChunk picks the script index.html names, not the biggest file", () => {
  // The lazy locale catalogs are separate chunks by design. A "largest file"
  // rule would keep working until the split regressed and then silently start
  // reporting a locale chunk as the entry.
  const dist = tempDir("comvi-verify-dist-");
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "assets", "index-aaa.js"), "x".repeat(100));
  fs.writeFileSync(path.join(dist, "assets", "uk-bbb.js"), "y".repeat(10_000));
  fs.writeFileSync(
    path.join(dist, "index.html"),
    '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-aaa.js"></script></head><body></body></html>',
  );

  assert.equal(entryChunk(dist), path.join(dist, "assets", "index-aaa.js"));
});

test("entryChunk throws when the build wrote no module script", () => {
  const dist = tempDir("comvi-verify-noscript-");
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><html></html>");

  assert.throws(() => entryChunk(dist), { message: /no module script/ });
});

test("parseArgs defaults to building, packing and verifying every example", () => {
  assert.deepEqual(parseArgs([]), {
    only: [],
    build: true,
    pack: true,
    keep: false,
    json: false,
  });
});

test("parseArgs collects repeated --only and the negative flags", () => {
  assert.deepEqual(parseArgs(["--only", "react", "--only", "vue", "--no-build", "--keep"]), {
    only: ["react", "vue"],
    build: false,
    pack: true,
    keep: true,
    json: false,
  });
});

test("parseArgs rejects an unknown argument rather than ignoring it", () => {
  assert.throws(() => parseArgs(["--only", "react", "--typo"]), {
    message: /unknown argument: --typo/,
  });
});

test("provenanceLine makes no claim when an example never reached the assertion", () => {
  // The failure this exists for: every install dies, `assertLocalResolutions`
  // never runs, and the summary above the red table still says every
  // resolution is a local tarball.
  const results = [
    { name: "react", ok: false, provenanceChecked: false },
    { name: "vue", ok: true, provenanceChecked: true },
  ];

  const line = provenanceLine(results, [{ name: "@comvi/core" }], { pack: true });

  assert.match(line, /provenance NOT established: react/);
  assert.doesNotMatch(line, /every @comvi resolution in all/);
});

test("provenanceLine says reused, not packed, under --no-pack", () => {
  const results = [{ name: "vue", ok: true, provenanceChecked: true }];

  const line = provenanceLine(results, [{ name: "@comvi/core" }], { pack: false });

  assert.match(line, /reused \(--no-pack\)/);
  assert.doesNotMatch(line, /packed/);
});
