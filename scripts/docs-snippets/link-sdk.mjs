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
 *     first — `@comvi/plugin-fetch-loader/cdn` re-exporting a directory index
 *     that node16 cannot resolve — lives entirely in that gap.
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
 * installed" is not "it installed what you meant": the version in
 * `node_modules/@comvi/core/package.json` must equal the workspace's, and
 * `loader` must resolve out of `@comvi/core/loader` — a symbol that exists only
 * in 0.5. Both, or the run fails loudly. A gate whose SDK silently fell back to
 * the registry is the failure this whole lot is about.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

/**
 * Framework packages installed alongside, so `--sdk-root` also answers `react`,
 * `vue`, `svelte` and their types.
 *
 * Without them the docs' `.tsx` fences fail on `import { useState } from
 * 'react'` — a finding about the checking environment wearing the costume of a
 * finding about the docs. Versions are read from the workspace's own
 * devDependencies rather than written here, so the gate checks against what the
 * packages are built and tested against.
 */
export const FRAMEWORK_DEPS = [
  "react",
  "react-dom",
  "@types/react",
  "@types/react-dom",
  "vue",
  "svelte",
  "solid-js",
  "next",
  "@types/node",
];

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
      for (const name of FRAMEWORK_DEPS) {
        if (seen[name] || !pool?.[name]) continue;
        const range = pool[name];
        // A peer range like `>=18` is a compatibility statement, not a version
        // to install; skip it and let a concrete pin elsewhere answer.
        if (/^[><]/.test(range) || range.includes("||")) continue;
        seen[name] = range;
      }
    }
  }
  for (const name of FRAMEWORK_DEPS) if (!seen[name]) seen[name] = "latest";
  return seen;
}

/**
 * Fail unless the install really is the workspace's 0.5.
 *
 * Two independent probes, because either alone has a hole: the version could
 * match while the tarball was built from stale `dist/`, and the symbol could
 * resolve from a registry copy of a future release. Together they say "this is
 * the code in this working tree".
 */
export async function assertInstall(dir, packages) {
  const core = packages.find((pkg) => pkg.name === "@comvi/core");
  if (!core) throw new Error("@comvi/core is not among the workspace packages");

  const installed = path.join(dir, "node_modules", "@comvi", "core", "package.json");
  if (!fs.existsSync(installed)) {
    throw new Error(`@comvi/core did not install into ${dir}`);
  }
  const version = JSON.parse(fs.readFileSync(installed, "utf8")).version;
  if (version !== core.version) {
    throw new Error(
      `installed @comvi/core is ${version}, the workspace is ${core.version} — ` +
        "the install resolved to the registry, not to the local tarball. " +
        "Checking the docs against it would report this tree's version while compiling last release's code.",
    );
  }

  // `loader` exists only in 0.5: in 0.4 the capability lived on the host as
  // `registerLoader`. Resolving it proves the tarball carries the new code and
  // that `exports` publishes the subpath — the two things a version string
  // cannot say.
  const loaderModule = await import(
    path.join(dir, "node_modules", "@comvi", "core", "dist", "loader.js")
  ).catch(async () => {
    const url = await import("node:module").then(({ createRequire }) =>
      createRequire(path.join(dir, "package.json")).resolve("@comvi/core/loader"),
    );
    return import(url);
  });
  if (typeof loaderModule.loader !== "function") {
    throw new Error(
      "`loader` does not resolve from @comvi/core/loader in the installed package — " +
        "this is a 0.4 build, or the exports map lost the subpath.",
    );
  }
  return { version, symbols: Object.keys(loaderModule).sort() };
}

export async function linkSdk({ root = REPO_ROOT, dir = null, build = true, pack = true } = {}) {
  const target = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "comvi-docs-sdk-"));
  fs.mkdirSync(target, { recursive: true });

  if (build) run("pnpm", ["build"], { cwd: root });
  if (pack) run("pnpm", ["pack:release"], { cwd: root });

  const packages = workspacePackages(root);
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
      `link-sdk: ${result.packages.length} packages, @comvi/core@${result.proof.version} verified, ` +
        `\`loader\` resolves from @comvi/core/loader.`,
    );
    console.error("link-sdk: pass this to the gate as --sdk-root:");
    console.log(result.dir);
  } catch (error) {
    console.error(`link-sdk: ${error.message}`);
    process.exit(1);
  }
}
