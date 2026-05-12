#!/usr/bin/env node
// Verifies that every publishable package's package.json contract matches what
// `npm pack --dry-run` actually includes: `files` covers `dist`, `sideEffects` is
// `false` or an explicit list, every exports/main/module/types/bin target is packed,
// bin targets are executable with a shebang, and no `.DS_Store`/`.env*`/`.tsbuildinfo`
// is shipped. Known limitations: the `.env*` check only matches a root-level entry
// (not e.g. `dist/.env`); suffix globs in exports (`./dist/*.css`) degrade to a weak
// prefix check; the bin executable-bit check reads the working-tree mode, not the
// 0755 npm normalises to in the tarball. Run after `pnpm build` (it inspects dist/).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const packagesDir = path.join(rootDir, "packages");
const forbiddenPackageEntries = [
  ".DS_Store",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
];

function normalizePackagePath(value) {
  return value.replace(/^\.\//, "").replaceAll(path.sep, "/");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function collectExportTargets(value, targets = []) {
  if (typeof value === "string") {
    targets.push(value);
    return targets;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const nested of Object.values(value)) {
      collectExportTargets(nested, targets);
    }
  }
  return targets;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function isGlobTarget(target) {
  return target.includes("*");
}

function validateTargetIncluded(packageName, field, target, packedFiles, errors) {
  const normalized = normalizePackagePath(target);
  if (isGlobTarget(normalized)) {
    const prefix = normalized.slice(0, normalized.indexOf("*"));
    assert(
      Array.from(packedFiles).some((file) => file.startsWith(prefix)),
      `${packageName}: ${field} glob ${target} has no matching packed files`,
      errors,
    );
    return;
  }

  assert(
    packedFiles.has(normalized),
    `${packageName}: ${field} target ${target} is not included by npm pack --dry-run`,
    errors,
  );
}

function validateBin(packageName, bin, packedFiles, packageDir, errors) {
  if (!bin) return;
  const entries = typeof bin === "string" ? { [packageName.split("/").pop()]: bin } : bin;
  for (const [name, target] of Object.entries(entries)) {
    const normalized = normalizePackagePath(target);
    validateTargetIncluded(packageName, `bin.${name}`, target, packedFiles, errors);

    const absTarget = path.join(packageDir, normalized);
    assert(existsSync(absTarget), `${packageName}: bin.${name} ${target} does not exist`, errors);
    if (existsSync(absTarget)) {
      const content = readFileSync(absTarget, "utf8");
      const mode = statSync(absTarget).mode;
      assert(
        content.startsWith("#!/"),
        `${packageName}: bin.${name} ${target} lacks a shebang`,
        errors,
      );
      assert(
        (mode & 0o111) !== 0,
        `${packageName}: bin.${name} ${target} is not executable by any user class`,
        errors,
      );
    }
  }
}

function npmPackDryRun(packageDir) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output);
  return new Set(parsed.flatMap((item) => item.files.map((file) => file.path)));
}

const packageDirs = (await readdir(packagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name))
  .filter((packageDir) => existsSync(path.join(packageDir, "package.json")))
  .sort();

const errors = [];
const summaries = [];

for (const packageDir of packageDirs) {
  const manifestPath = path.join(packageDir, "package.json");
  const manifest = readJson(manifestPath);
  if (manifest.private === true) continue;

  const packageName = manifest.name ?? path.basename(packageDir);
  const packedFiles = npmPackDryRun(packageDir);
  const packageErrors = [];

  assert(
    manifest.files?.includes("dist"),
    `${packageName}: files must include dist`,
    packageErrors,
  );
  assert(
    manifest.sideEffects === false || Array.isArray(manifest.sideEffects),
    `${packageName}: sideEffects must be false or an explicit side-effect file list`,
    packageErrors,
  );

  if (manifest.exports) {
    for (const target of collectExportTargets(manifest.exports)) {
      validateTargetIncluded(packageName, "exports", target, packedFiles, packageErrors);
    }
  } else {
    assert(manifest.main, `${packageName}: package must define exports or main`, packageErrors);
  }

  for (const field of ["main", "module", "types"]) {
    if (manifest[field]) {
      validateTargetIncluded(packageName, field, manifest[field], packedFiles, packageErrors);
    }
  }

  validateBin(packageName, manifest.bin, packedFiles, packageDir, packageErrors);

  for (const entry of forbiddenPackageEntries) {
    assert(
      !packedFiles.has(entry),
      `${packageName}: forbidden local artifact ${entry} is packed`,
      packageErrors,
    );
  }
  for (const packedFile of packedFiles) {
    assert(
      !packedFile.endsWith(".tsbuildinfo"),
      `${packageName}: ${packedFile} must not be packed`,
      packageErrors,
    );
    assert(
      !packedFile.endsWith("/.DS_Store"),
      `${packageName}: ${packedFile} must not be packed`,
      packageErrors,
    );
  }

  const failed = packageErrors.length > 0;
  if (failed) errors.push(...packageErrors);
  summaries.push(`${failed ? "FAIL" : "PASS"} ${packageName}: ${packedFiles.size} files checked`);
}

for (const summary of summaries) {
  console.log(summary);
}

if (errors.length > 0) {
  console.error("\nPackage contract check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Package contract check passed for ${summaries.length} publishable packages.`);
