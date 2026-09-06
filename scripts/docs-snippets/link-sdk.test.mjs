import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FRAMEWORK_DEPS,
  assertInstall,
  installManifest,
  tarballFor,
  workspacePackages,
} from "./link-sdk.mjs";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "comvi-link-sdk-test-"));
}

/** A miniature workspace: two packages, one private, with packed tarballs. */
function fakeWorkspace(dir, { pack = true } = {}) {
  const packages = [
    { name: "@comvi/core", version: "0.5.0", folder: "core" },
    { name: "@comvi/react", version: "0.5.0", folder: "react" },
    { name: "@comvi/private", version: "0.0.0", folder: "private", private: true },
  ];
  for (const pkg of packages) {
    const target = path.join(dir, "packages", pkg.folder);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "package.json"),
      JSON.stringify({ name: pkg.name, version: pkg.version, private: pkg.private }),
    );
    if (pack && !pkg.private) {
      const bare = pkg.name.replace(/^@/, "").replace("/", "-");
      fs.writeFileSync(path.join(target, `${bare}-${pkg.version}.tgz`), "");
    }
  }
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "ws", private: true }));
  return dir;
}

test("private packages are not packed or installed", () => {
  const dir = fakeWorkspace(scratch());

  assert.deepEqual(
    workspacePackages(dir).map((pkg) => pkg.name),
    ["@comvi/core", "@comvi/react"],
  );
});

test("the tarball is found by name and version, not by whichever file is newest", () => {
  // A stale tarball beside a fresh one is exactly where "most recent file" picks
  // the previous release and the gate goes green against last version's code.
  const dir = fakeWorkspace(scratch());
  const core = workspacePackages(dir).find((pkg) => pkg.name === "@comvi/core");
  const stale = path.join(core.dir, "comvi-core-0.4.0.tgz");
  fs.writeFileSync(stale, "");
  fs.utimesSync(stale, new Date(), new Date());

  assert.equal(path.basename(tarballFor(core)), "comvi-core-0.5.0.tgz");
});

test("a missing tarball is an error, not a silently skipped package", () => {
  const dir = fakeWorkspace(scratch(), { pack: false });
  const core = workspacePackages(dir).find((pkg) => pkg.name === "@comvi/core");

  assert.throws(() => tarballFor(core), /pack:release/);
});

test("every @comvi package is pinned through pnpm.overrides, not only as a dependency", () => {
  // `pnpm pack` rewrites `workspace:*` to a concrete version, so the packed
  // `@comvi/react` depends on `@comvi/core@0.5.0` FROM THE REGISTRY. Only an
  // override reaches that transitive resolution; a plain dependency list would
  // install the local react on top of a registry core and report the local
  // version while compiling the published one.
  const dir = fakeWorkspace(scratch());
  const packages = workspacePackages(dir);
  const manifest = installManifest(packages, { react: "19.0.0" });

  assert.deepEqual(Object.keys(manifest.pnpm.overrides).sort(), ["@comvi/core", "@comvi/react"]);
  for (const specifier of Object.values(manifest.pnpm.overrides)) {
    assert.match(specifier, /^file:.*\.tgz$/);
  }
});

test("framework peers are installed alongside, so a .tsx fence is not judged on `import react`", () => {
  const dir = fakeWorkspace(scratch());
  const manifest = installManifest(workspacePackages(dir), { react: "19.0.0", vue: "3.5.0" });

  assert.equal(manifest.dependencies.react, "19.0.0");
  assert.equal(manifest.dependencies.vue, "3.5.0");
  assert.ok(FRAMEWORK_DEPS.includes("react"));
});

test("an install whose @comvi/core version differs from the workspace fails loudly", () => {
  // The registry has 0.4.0 too, so a resolution that silently fell back to it
  // would install a package with a plausible version and no `.with()`.
  const dir = scratch();
  const installed = path.join(dir, "node_modules", "@comvi", "core");
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(
    path.join(installed, "package.json"),
    JSON.stringify({ name: "@comvi/core", version: "0.4.0" }),
  );

  return assert.rejects(
    () => assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]),
    /installed @comvi\/core is 0\.4\.0, the workspace is 0\.5\.0/,
  );
});

test("an install with a matching version but no `loader` symbol fails too", () => {
  // The version check alone has a hole: the registry version can equal the
  // workspace version during a patch cycle. `loader` from `@comvi/core/loader`
  // exists only in 0.5 — in 0.4 the capability was a method on the host — so it
  // is the probe that says WHICH code arrived, not merely which number.
  const dir = scratch();
  const installed = path.join(dir, "node_modules", "@comvi", "core", "dist");
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(
    path.join(installed, "..", "package.json"),
    JSON.stringify({ name: "@comvi/core", version: "0.5.0" }),
  );
  fs.writeFileSync(path.join(installed, "loader.js"), "export const nothing = 1;\n");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "probe" }));

  return assert.rejects(
    () => assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]),
    /`loader` does not resolve/,
  );
});

test("an install with the version and the symbol passes", () => {
  const dir = scratch();
  const pkg = path.join(dir, "node_modules", "@comvi", "core");
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "@comvi/core", version: "0.5.0" }),
  );
  fs.writeFileSync(path.join(pkg, "dist", "loader.js"), "export function loader() {}\n");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "probe" }));

  return assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]).then((proof) => {
    assert.equal(proof.version, "0.5.0");
    assert.ok(proof.symbols.includes("loader"));
  });
});
