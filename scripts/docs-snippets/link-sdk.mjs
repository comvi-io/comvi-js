#!/usr/bin/env node
/**
 * A real installation of the unpublished workspace, for `--sdk-root` (lot D2b).
 *
 * The gate has to check the docs against 0.5, and before the RC there is no 0.5
 * on npm. The obvious shortcuts are the ones the critic took apart (docs-0.5
 * plan §6.1.1), and it is worth writing down why, because each looks fine:
 *
 *   - **Symlinking the workspace.** Then the docs are checked against `src/`
 *     through the workspace's own tsconfig paths, not against the `exports` map
 *     and the `dist/*.d.ts` a reader gets. The one class of bug this gate found
 *     first — a fetch-loader entry point re-exporting a directory index that
 *     node16 cannot resolve — lives entirely in that gap.
 *   - **Installing one tarball.** `pnpm pack` REWRITES `workspace:*` to a
 *     concrete version, so the packed `@comvi/react` depends on
 *     `@comvi/core@0.4.0` FROM THE REGISTRY. The install succeeds, the gate
 *     goes green, and it went green against last release's core while
 *     reporting the next one's version. Hence: pack all fourteen, and pin every
 *     `@comvi/*` to its own tarball through `pnpm.overrides`, which applies to
 *     transitive dependencies too.
 *   - **Installing into the repo.** `pnpm add` writes a lockfile, and a written
 *     lockfile breaks `--frozen-lockfile` in the platform's CI. So the install
 *     goes to a temp directory outside every workspace, with its own
 *     `package.json`, and no lockfile in this repo is read or written.
 *
 * The post-install assertion is the part that must not be skipped. "It
 * installed" is not "it installed what you meant", and the three probes answer
 * three different lies:
 *
 *   - **Provenance.** Every `@comvi/*` resolution in the temp lockfile must be
 *     a `file:` reference. This is the probe that can actually fail on the
 *     failure mode that matters: comparing the installed version against the
 *     workspace version proves nothing while the registry carries the same
 *     version — 0.4.0 exists in both places today — so a silent fallback would
 *     pass a version check and fail nothing. It also covers all fourteen
 *     packages rather than core alone.
 *   - **Identity.** `node_modules/@comvi/core/package.json` must still carry
 *     the workspace's version, which catches a stale tarball from an earlier
 *     version left in a package directory.
 *   - **Shape.** `loader` must resolve THROUGH THE SPECIFIER
 *     `@comvi/core/loader`, never through a `dist/` path, because resolving the
 *     specifier is what exercises the published `exports` map — the thing a
 *     reader's bundler uses and the thing this gate exists to check. `loader`
 *     is 0.5-only besides: in 0.4 the capability was a method on the host.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

/**
 * The environment installed alongside the packages, so `--sdk-root` answers
 * more than `@comvi/*`.
 *
 * Two groups, both there for the same reason: a fence must be judged on the
 * Comvi API it demonstrates, never on the scaffolding around it.
 *
 *   - Framework runtimes and their types. Without them every `.tsx` fence fails
 *     on `import { useState } from 'react'` — a finding about the checking
 *     environment wearing the costume of a finding about the docs.
 *   - Test runners. `guides/testing.mdx` is the one page whose SUBJECT is the
 *     harness: 15 of its 28 type errors were "cannot find module 'vitest'" and
 *     "cannot find name 'test'". `@playwright/test` is deliberately absent —
 *     those fences are end-to-end code with no Comvi API in them and belong
 *     under `check=skip:e2e-harness`, not in this install.
 *
 * Versions are read from the workspace's own manifests rather than written
 * here, so the gate checks against what the packages are built and tested
 * against. A name the workspace does not pin falls back to `latest`, which is
 * the honest answer for a package the repo has no opinion about.
 */
export const WORKSPACE_DEPS = [
  "react",
  "react-dom",
  "@types/react",
  "@types/react-dom",
  "vue",
  "svelte",
  "solid-js",
  "next",
  // `nuxt` arrives anyway as an auto-installed peer of `@comvi/nuxt`, but the
  // peer range is `^3.0.0 || ^4.0.0` and pnpm resolved it to 4.5.2 while the
  // package is developed and tested against the `^3.21.4` its devDependencies
  // pin. Naming it here pins it to the workspace's version.
  "nuxt",
  "@types/node",
  "vitest",
  "@testing-library/react",
  "@vue/test-utils",
];

/**
 * Packages the gate needs that the workspace has no reason to depend on.
 *
 * Every entry carries a literal version and a reason. The alternative was a
 * phantom devDependency added to a js-sdk package that never imports it, which
 * is a worse lie than the one it fixes: the workspace would claim to use
 * something it does not, and the next person to prune unused dependencies would
 * remove it and break the gate from a distance.
 */
export const EXPLICIT_DEPS = {
  // `svelte.mdx` has one testing fence. No js-sdk package renders Svelte
  // components in its own tests — `packages/svelte` tests the store surface —
  // so there is nothing in the workspace to read a version from. 5.4.2 is what
  // a temp install resolved; bump it deliberately.
  "@testing-library/svelte": "^5.4.2",
};

/** Every name installed alongside `@comvi/*`, whichever way its version is decided. */
export const FRAMEWORK_DEPS = [...WORKSPACE_DEPS, ...Object.keys(EXPLICIT_DEPS)];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
    ...options,
  });
  if (result.status !== 0) {
    const detail = options.quiet ? `\n${result.stdout ?? ""}${result.stderr ?? ""}` : "";
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}${detail}`);
  }
  return result.stdout ?? "";
}

/** Every publishable `packages/*` with its name, version and directory. */
export function workspacePackages(root = REPO_ROOT) {
  const dir = path.join(root, "packages");
  const out = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    const manifestPath = path.join(dir, entry, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.private) continue;
    out.push({ name: manifest.name, version: manifest.version, dir: path.join(dir, entry) });
  }
  return out;
}

/**
 * The `<name>-<version>.tgz` `pnpm pack` leaves in a package directory.
 *
 * By name, not by mtime: a stale tarball from a previous version sitting beside
 * a fresh one is exactly the situation where "newest file" picks wrong, and the
 * failure is a green gate against old code.
 */
export function tarballFor(pkg) {
  const bare = pkg.name.replace(/^@/, "").replace("/", "-");
  const expected = path.join(pkg.dir, `${bare}-${pkg.version}.tgz`);
  if (!fs.existsSync(expected)) {
    throw new Error(
      `no tarball for ${pkg.name}@${pkg.version} at ${expected} — did \`pnpm pack:release\` run?`,
    );
  }
  return expected;
}

/**
 * The manifest of the throwaway install.
 *
 * `pnpm.overrides` rather than plain dependencies: an override applies to
 * TRANSITIVE resolution too, which is the only way to stop the packed
 * `@comvi/react`'s rewritten `@comvi/core@<version>` dependency from being
 * fetched off the registry.
 */
export function installManifest(packages, frameworkVersions) {
  const overrides = {};
  const dependencies = {};
  for (const pkg of packages) {
    const specifier = `file:${tarballFor(pkg)}`;
    overrides[pkg.name] = specifier;
    dependencies[pkg.name] = specifier;
  }
  return {
    name: "comvi-docs-sdk-root",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: { ...dependencies, ...frameworkVersions },
    pnpm: { overrides },
  };
}

/** Framework versions as the workspace itself pins them. */
export function frameworkVersions(root = REPO_ROOT) {
  const seen = {};
  const manifests = [
    path.join(root, "package.json"),
    ...workspacePackages(root).map((pkg) => path.join(pkg.dir, "package.json")),
    ...["react", "vue", "svelte", "solid", "next", "nuxt"].map((app) =>
      path.join(root, "test-apps", app, "package.json"),
    ),
  ];
  for (const manifestPath of manifests) {
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const pools = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies];
    for (const pool of pools) {
      for (const name of WORKSPACE_DEPS) {
        if (seen[name] || !pool?.[name]) continue;
        const range = pool[name];
        // A peer range like `>=18` is a compatibility statement, not a version
        // to install; skip it and let a concrete pin elsewhere answer.
        if (/^[><]/.test(range) || range.includes("||")) continue;
        seen[name] = range;
      }
    }
  }
  const unpinned = WORKSPACE_DEPS.filter((name) => !seen[name]);
  if (unpinned.length > 0) {
    // `latest` was the old fallback, and it makes the gate check the docs
    // against whatever npm published this morning: a run that fails tomorrow
    // for a reason nobody changed. If the workspace has no opinion about a
    // package the gate installs, that is a gap in the workspace, not a default
    // for this script to invent.
    throw new Error(
      `no version pinned anywhere in the workspace for: ${unpinned.join(", ")}. ` +
        "Add it to the devDependencies of the package that needs it, or — if no package has a " +
        "reason to depend on it — put it in EXPLICIT_DEPS with a literal version and a reason. " +
        "The gate installs what the workspace is built against, never `latest`.",
    );
  }
  return { ...seen, ...EXPLICIT_DEPS };
}

/**
 * Fail unless the install really is the workspace's 0.5.
 *
 * Two independent probes, because either alone has a hole: the version could
 * match while the tarball was built from stale `dist/`, and the symbol could
 * resolve from a registry copy of a future release. Together they say "this is
 * the code in this working tree".
 */
/**
 * Every place the lockfile names a RESOLVED `@comvi/*` package, as
 * `{ name, reference }`.
 *
 * Two shapes in lockfile v9: the `packages:` / `snapshots:` keys
 * (`'@comvi/core@file:…'`) and the `version:` line under each importer
 * dependency. The `overrides:` block is deliberately not read — it records what
 * was ASKED for, and the question here is what arrived.
 */
export function comviResolutions(lockfile) {
  const out = [];
  for (const match of lockfile.matchAll(/^\s*'?(@comvi\/[A-Za-z0-9._-]+)@(.+?)'?:\s*$/gm)) {
    out.push({ name: match[1], reference: match[2] });
  }
  for (const match of lockfile.matchAll(
    /^\s*'?(@comvi\/[A-Za-z0-9._-]+)'?:\n\s*specifier:[^\n]*\n\s*version:\s*(.+)$/gm,
  )) {
    out.push({ name: match[1], reference: match[2].trim() });
  }
  return out;
}

/** Resolutions that did not come from a local tarball. */
export function registryResolutions(lockfile) {
  return comviResolutions(lockfile).filter((entry) => !/^(file:|link:)/.test(entry.reference));
}

export async function assertInstall(dir, packages) {
  const core = packages.find((pkg) => pkg.name === "@comvi/core");
  if (!core) throw new Error("@comvi/core is not among the workspace packages");

  const lockPath = path.join(dir, "pnpm-lock.yaml");
  if (!fs.existsSync(lockPath)) {
    throw new Error(`no pnpm-lock.yaml in ${dir} — the install did not run, or pnpm wrote none`);
  }
  const lock = fs.readFileSync(lockPath, "utf8");
  // Fail CLOSED. `comviResolutions` is a set of regexes over one lockfile
  // format, and a lockfile it cannot read yields zero entries — which the stray
  // filter below then reports as zero strays, i.e. green. A provenance check
  // that passes because it understood nothing is worse than none, because it
  // reads as evidence. Every package must be accounted for at least once.
  const seen = new Set(comviResolutions(lock).map((entry) => entry.name));
  const unaccounted = packages.filter((pkg) => !seen.has(pkg.name));
  if (unaccounted.length > 0) {
    throw new Error(
      `the lockfile in ${dir} names no resolution for ${unaccounted.map((pkg) => pkg.name).join(", ")} ` +
        `(${seen.size} of ${packages.length} packages parsed). Either the install did not happen, or ` +
        "this is a lockfile format `comviResolutions` cannot read — in which case provenance was " +
        "never checked and must not be reported as clean.",
    );
  }
  const strays = registryResolutions(lock);
  if (strays.length > 0) {
    throw new Error(
      `${strays.length} @comvi resolution(s) came from the registry, not from a local tarball: ` +
        `${strays.map((stray) => `${stray.name}@${stray.reference}`).join(", ")}. ` +
        "`pnpm pack` rewrites `workspace:*` to a concrete version, so a package whose override " +
        "did not apply pulls the PUBLISHED dependency and the gate goes green against it.",
    );
  }

  const installed = path.join(dir, "node_modules", "@comvi", "core", "package.json");
  if (!fs.existsSync(installed)) {
    throw new Error(`@comvi/core did not install into ${dir}`);
  }
  const version = JSON.parse(fs.readFileSync(installed, "utf8")).version;
  if (version !== core.version) {
    throw new Error(
      `installed @comvi/core is ${version}, the workspace is ${core.version} — ` +
        "a stale tarball, or an override that did not apply.",
    );
  }

  let entry;
  try {
    entry = createRequire(path.join(dir, "package.json")).resolve("@comvi/core/loader");
  } catch (error) {
    throw new Error(
      "`@comvi/core/loader` does not resolve from the install — the published `exports` map " +
        `lost the subpath: ${error.message}`,
    );
  }
  const loaderModule = await import(pathToFileURL(entry).href);
  if (typeof loaderModule.loader !== "function") {
    throw new Error(
      "`loader` does not resolve from @comvi/core/loader in the installed package — " +
        "this is a 0.4 build, where the capability was a method on the host.",
    );
  }
  return { version, entry, symbols: Object.keys(loaderModule).sort() };
}

/**
 * Delete every `packages/<pkg>/*.tgz` before packing.
 *
 * `pnpm pack` names the file for the version, so a tarball from a previous
 * version survives a re-pack and can be found again once the version moves on.
 * Removing them first means the only tarballs on disk are this run's.
 */
export function cleanTarballs(root = REPO_ROOT) {
  const removed = [];
  for (const pkg of workspacePackages(root)) {
    for (const entry of fs.readdirSync(pkg.dir)) {
      if (!entry.endsWith(".tgz")) continue;
      const abs = path.join(pkg.dir, entry);
      fs.rmSync(abs);
      removed.push(abs);
    }
  }
  return removed;
}

/** The newest mtime under `dir`, or `null` when it does not exist. */
function newestMtime(dir) {
  if (!fs.existsSync(dir)) return null;
  let newest = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else newest = Math.max(newest, fs.statSync(abs).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

/**
 * Refuse a `--no-pack` run whose tarballs are older than the code inside them.
 *
 * `--no-pack` exists to save two minutes on a re-run. It also silently checks
 * the docs against whatever was packed last time, which after any edit to a
 * package is the previous build. The flag stays; the silence does not.
 */
export function assertTarballsFresh(packages) {
  const stale = [];
  for (const pkg of packages) {
    const tarball = tarballFor(pkg);
    const built = newestMtime(path.join(pkg.dir, "dist"));
    if (built === null) continue;
    if (fs.statSync(tarball).mtimeMs < built) stale.push(pkg.name);
  }
  if (stale.length > 0) {
    throw new Error(
      `--no-pack, but the tarball is older than the build for: ${stale.join(", ")}. ` +
        "Re-run without --no-pack, or the gate checks the docs against the previous build.",
    );
  }
}

export async function linkSdk({ root = REPO_ROOT, dir = null, build = true, pack = true } = {}) {
  const target = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "comvi-docs-sdk-"));
  fs.mkdirSync(target, { recursive: true });

  if (build) run("pnpm", ["build"], { cwd: root });
  if (pack) {
    cleanTarballs(root);
    run("pnpm", ["pack:release"], { cwd: root });
  }

  const packages = workspacePackages(root);
  if (!pack) assertTarballsFresh(packages);
  const manifest = installManifest(packages, frameworkVersions(root));
  fs.writeFileSync(path.join(target, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // `.npmrc`, not flags: `--ignore-workspace` keeps pnpm from walking up into
  // this repo's `pnpm-workspace.yaml`, and `node-linker=hoisted` gives the temp
  // tree the flat `node_modules` that module resolution from a virtual root
  // expects.
  fs.writeFileSync(
    path.join(target, ".npmrc"),
    "ignore-workspace=true\nnode-linker=hoisted\nstrict-peer-dependencies=false\n",
  );

  run("pnpm", ["install", "--no-frozen-lockfile", "--ignore-workspace"], { cwd: target });
  const proof = await assertInstall(target, packages);
  return { dir: target, packages, proof };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  try {
    const result = await linkSdk({
      dir: at("--dir"),
      build: !argv.includes("--no-build"),
      pack: !argv.includes("--no-pack"),
    });
    console.error(
      `link-sdk: ${result.packages.length} packages, every @comvi resolution is a local tarball, ` +
        `@comvi/core@${result.proof.version} verified, \`loader\` resolves through ` +
        `@comvi/core/loader (${result.proof.entry}).`,
    );
    console.error("link-sdk: pass this to the gate as --sdk-root:");
    console.log(result.dir);
  } catch (error) {
    console.error(`link-sdk: ${error.message}`);
    process.exit(1);
  }
}
