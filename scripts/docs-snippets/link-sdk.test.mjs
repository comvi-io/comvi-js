import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FRAMEWORK_DEPS,
  assertInstall,
  assertTarballsFresh,
  cleanTarballs,
  installManifest,
  registryResolutions,
  tarballFor,
  workspacePackages,
} from "./link-sdk.mjs";

/** A v9 lockfile with the two shapes a resolved @comvi package appears in. */
function lockfile({ core = "file:../packages/core/comvi-core-0.5.0.tgz" } = {}) {
  return [
    "lockfileVersion: '9.0'",
    "",
    "overrides:",
    "  '@comvi/core': file:/abs/packages/core/comvi-core-0.5.0.tgz",
    "",
    "importers:",
    "",
    "  .:",
    "    dependencies:",
    "      '@comvi/core':",
    "        specifier: file:/abs/packages/core/comvi-core-0.5.0.tgz",
    `        version: ${core}`,
    "",
    "packages:",
    "",
    `  '@comvi/core@${core}':`,
    "    resolution: {tarball: file:x}",
    "",
  ].join("\n");
}

/** Write a lockfile into `dir` and run the full assertion over a good install. */
function installedCore(dir, { version = "0.5.0", lock = lockfile(), loader = true } = {}) {
  const pkg = path.join(dir, "node_modules", "@comvi", "core");
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "@comvi/core",
      version,
      type: "module",
      exports: { "./loader": { default: "./dist/loader.js" } },
    }),
  );
  fs.writeFileSync(
    path.join(pkg, "dist", "loader.js"),
    loader ? "export function loader() {}\n" : "export const nothing = 1;\n",
  );
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "probe" }));
  fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), lock);
  return dir;
}

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

test("an @comvi resolution that came from the registry fails the install", () => {
  // The probe that actually works. Version equality proves nothing while the
  // registry carries the same version — 0.4.0 exists in both places today — so
  // a silent fallback would pass a version check and fail nothing.
  const dir = installedCore(scratch(), { lock: lockfile({ core: "0.5.0" }) });

  return assert.rejects(
    () => assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]),
    /came from the registry, not from a local tarball/,
  );
});

test("an install whose resolutions are all file: passes provenance", () => {
  const dir = installedCore(scratch());

  return assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]).then((proof) => {
    assert.equal(proof.version, "0.5.0");
    assert.ok(proof.symbols.includes("loader"));
  });
});

test("registryResolutions reads the packages key and the importer version alike", () => {
  assert.deepEqual(registryResolutions(lockfile()), []);
  assert.deepEqual(
    registryResolutions(lockfile({ core: "0.5.0" })).map((entry) => entry.reference),
    ["0.5.0", "0.5.0"],
  );
});

test("a missing lockfile is an error, not an install nobody checked", () => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "probe" }));

  return assert.rejects(
    () => assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]),
    /no pnpm-lock\.yaml/,
  );
});

test("a stale tarball whose version differs from the workspace fails", () => {
  const dir = installedCore(scratch(), { version: "0.4.0" });

  return assert.rejects(
    () => assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]),
    /installed @comvi\/core is 0\.4\.0, the workspace is 0\.5\.0/,
  );
});

test("`loader` is resolved THROUGH the exports map, so a lost subpath fails", () => {
  // Importing `dist/loader.js` by path would succeed here and prove nothing:
  // the file exists, and the `exports` map — the thing a reader's bundler reads
  // — is what this has to exercise.
  const dir = installedCore(scratch());
  const manifest = path.join(dir, "node_modules", "@comvi", "core", "package.json");
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  delete parsed.exports["./loader"];
  fs.writeFileSync(manifest, JSON.stringify(parsed));

  return assert.rejects(
    () => assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]),
    /does not resolve from the install — the published `exports` map lost the subpath/,
  );
});

test("an install with the version and the exports map but a 0.4 build fails", () => {
  const dir = installedCore(scratch(), { loader: false });

  return assert.rejects(
    () => assertInstall(dir, [{ name: "@comvi/core", version: "0.5.0", dir: "" }]),
    /`loader` does not resolve from @comvi\/core\/loader/,
  );
});

test("cleanTarballs removes a stale tarball a re-pack would leave behind", () => {
  // `pnpm pack` names the file for the version, so a 0.4.0 tarball survives a
  // 0.5.0 re-pack and can be found again once the version moves on.
  const dir = fakeWorkspace(scratch());
  const core = workspacePackages(dir).find((pkg) => pkg.name === "@comvi/core");
  fs.writeFileSync(path.join(core.dir, "comvi-core-0.4.0.tgz"), "");

  const removed = cleanTarballs(dir);

  assert.equal(removed.length, 3);
  assert.deepEqual(
    fs.readdirSync(core.dir).filter((entry) => entry.endsWith(".tgz")),
    [],
  );
});

test("--no-pack refuses when a tarball is older than the build it claims to hold", () => {
  const dir = fakeWorkspace(scratch());
  const packages = workspacePackages(dir);
  const core = packages.find((pkg) => pkg.name === "@comvi/core");
  fs.mkdirSync(path.join(core.dir, "dist"), { recursive: true });
  fs.writeFileSync(path.join(core.dir, "dist", "index.js"), "export {};\n");
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(tarballFor(core), past, past);

  assert.throws(() => assertTarballsFresh(packages), /tarball is older than the build/);
});

test("--no-pack passes when every tarball is newer than its build", () => {
  const dir = fakeWorkspace(scratch());
  const packages = workspacePackages(dir);
  const core = packages.find((pkg) => pkg.name === "@comvi/core");
  fs.mkdirSync(path.join(core.dir, "dist"), { recursive: true });
  fs.writeFileSync(path.join(core.dir, "dist", "index.js"), "export {};\n");
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(tarballFor(core), future, future);

  assert.doesNotThrow(() => assertTarballsFresh(packages));
});

test("the test runners are installed alongside, so guides/testing.mdx is judged on Comvi", () => {
  // 15 of that page's 28 type errors were "cannot find module 'vitest'" and
  // "cannot find name 'test'". @playwright/test is deliberately absent: those
  // fences are e2e code with no Comvi API in them.
  for (const name of ["vitest", "@testing-library/react", "@vue/test-utils"]) {
    assert.ok(FRAMEWORK_DEPS.includes(name), name);
  }
  assert.ok(!FRAMEWORK_DEPS.includes("@playwright/test"));
});
