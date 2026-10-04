#!/usr/bin/env node
// `pnpm pack:release`: one tarball per PUBLISHABLE `packages/*` package, each with
// the root LICENSE copied in first. Private packages (inlined or vendored into the
// published ones) are skipped: their tarballs could never be published, and a
// hand publish of the release directory must not find them there.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyLicense } from "./copy-license.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
copyLicense(root);

const packagesDir = path.join(root, "packages");
for (const entry of readdirSync(packagesDir, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory()) continue;
  const packageDir = path.join(packagesDir, entry.name);
  const manifestPath = path.join(packageDir, "package.json");
  if (!existsSync(manifestPath)) continue;
  if (JSON.parse(readFileSync(manifestPath, "utf8")).private === true) continue;
  execFileSync("pnpm", ["pack"], { cwd: packageDir, stdio: "inherit" });
}
