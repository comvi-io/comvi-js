#!/usr/bin/env node
// `pnpm pack:release`: one tarball per PUBLISHABLE `packages/*` package, each with
// the root LICENSE copied in first. Private packages (inlined or vendored into the
// published ones) are skipped: their tarballs could never be published, and a
// hand publish of the release directory must not find them there.
//
// It refuses to pack a `dist/` that holds a script no manifest entry point
// reaches. That is what a turbo cache hit leaves behind (see clean-dist.mjs);
// `pnpm build` cleans every dist first, so the fix is always to run it.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkPackedJsReachable } from "./check-package-contracts.mjs";
import { copyLicense } from "./copy-license.mjs";

function publishablePackages(root) {
  const packagesDir = path.join(root, "packages");
  const packages = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(packagesDir, entry.name);
    const manifestPath = path.join(packageDir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.private !== true) packages.push({ packageDir, manifest });
  }
  return packages;
}

function filesUnder(dir, base) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory()
      ? filesUnder(full, base)
      : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/**
 * The stale-chunk check of check-package-contracts.mjs, run on the files on
 * disk (`dist/` and `bin/`) instead of an `npm pack --dry-run` listing: the same
 * walk, without one slow npm call per package.
 */
export function findUnreachableDistFiles(root) {
  return publishablePackages(root).flatMap(({ packageDir, manifest }) => {
    const files = new Set([
      ...filesUnder(path.join(packageDir, "dist"), packageDir),
      ...filesUnder(path.join(packageDir, "bin"), packageDir),
    ]);
    return checkPackedJsReachable(manifest.name, packageDir, files, manifest);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const stale = findUnreachableDistFiles(root);
  if (stale.length > 0) {
    console.error(
      "pack:release refused: run `pnpm build` (it cleans every dist first), then retry.",
    );
    for (const error of stale) console.error(`- ${error}`);
    process.exit(1);
  }
  copyLicense(root);
  for (const { packageDir } of publishablePackages(root)) {
    execFileSync("pnpm", ["pack"], { cwd: packageDir, stdio: "inherit" });
  }
}
