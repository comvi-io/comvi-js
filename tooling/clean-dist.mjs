#!/usr/bin/env node
// Removes a package's `dist/` so a build starts from nothing.
//
// Two ways a `dist/` collects files that no longer belong to it:
//   1. A build that does not empty it: a watch build, a builder with no clean
//      step, a second build step that adds to the first.
//   2. A turbo cache HIT. Turbo restores the cached files over whatever is
//      there and deletes nothing, so the chunks of every generation built on
//      this machine pile up (`comvi-core-i18n-<old hash>.js` next to the live one).
//
// Hence two call sites:
//   - every package `build` script starts with `node ../../tooling/clean-dist.mjs`
//     (cwd is the package), which covers 1 and every cache miss;
//   - the root `build` scripts run `node tooling/clean-dist.mjs --all` BEFORE
//     turbo, so a cache hit restores into an empty directory, which covers 2.
// A build that turbo runs for another task (`typecheck` and `test` depend on
// `^build`) can still restore over an old dist; `pnpm pack:release` refuses to
// pack such a dist, and `pnpm build` repairs it.
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Remove `<packageDir>/dist`. Returns whether there was one. */
export function cleanDist(packageDir) {
  if (!existsSync(path.join(packageDir, "package.json"))) {
    throw new Error(`clean-dist: ${packageDir} has no package.json; refusing to remove its dist`);
  }
  const dist = path.join(packageDir, "dist");
  if (!existsSync(dist)) return false;
  rmSync(dist, { recursive: true, force: true });
  return true;
}

/** Remove the `dist/` of every `packages/*` package. Returns the directories cleaned. */
export function cleanAllDists(root) {
  const packagesDir = path.join(root, "packages");
  const cleaned = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(packagesDir, entry.name);
    if (!existsSync(path.join(packageDir, "package.json"))) continue;
    if (cleanDist(packageDir)) cleaned.push(entry.name);
  }
  return cleaned.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--all")) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    console.log(`clean-dist: removed dist from ${cleanAllDists(root).length} packages`);
  } else {
    cleanDist(process.cwd());
  }
}
