#!/usr/bin/env node
// Copies the repository LICENSE into every publishable `packages/*` directory.
// npm packs a LICENSE only from the package directory, so without this step no
// tarball carries the license text. The copies are build outputs (gitignored),
// written by `pnpm build` and `pnpm pack:release`; `tooling/check-package-contracts.mjs`
// fails a tarball without one.
import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function copyLicense(root) {
  const license = path.join(root, "LICENSE");
  const packagesDir = path.join(root, "packages");
  const copied = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesDir, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    if (JSON.parse(readFileSync(manifestPath, "utf8")).private === true) continue;
    copyFileSync(license, path.join(packagesDir, entry.name, "LICENSE"));
    copied.push(entry.name);
  }
  return copied.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const copied = copyLicense(root);
  console.log(`copy-license: LICENSE copied into ${copied.length} packages`);
}
