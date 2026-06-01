#!/usr/bin/env node
// attw (Are The Types Wrong?) wrapper that AVOIDS the broken attw CLI extractor.
//
// Why a wrapper: `@arethetypeswrong/core@0.18.2`'s `extractTarball` decompresses with
// `new Gunzip((chunk) => (unzipped = chunk))`, which keeps only the LAST fflate chunk.
// fflate streams ~128KB chunks, so any tarball that decompresses to >128KB (every one
// of ours) loses all but the final chunk → `untar([])` → `data[0].filename` throws
// `Cannot read properties of undefined (reading 'filename')`. This hits the CLI and
// every `createPackageFrom*` helper. See .omc/plans/types-attw-publint.md "#1 RISK".
//
// This wrapper builds the in-memory file map itself: `pnpm pack` → `zlib.gunzipSync`
// (single-shot, multi-chunk-safe) → `tar.Parser` → a `/node_modules/<name>/...` map
// keyed exactly as attw's own `extractTarball` does, then runs the supported
// `new Package()` + `checkPackage()` API directly.
//
// FALSE-GREEN GUARD: an empty/garbage file map would make `checkPackage` report
// "0 problems" — a false green that defeats the purpose. So we ASSERT the extracted
// map is non-empty AND contains the package's package.json before trusting any verdict.
//
// Scope: this is the CI/package-contract gate and the local release-readiness
// verification tool.
//
// Usage:
//   node scripts/check-types-exports.mjs                 # all dual packages
//   node scripts/check-types-exports.mjs core next        # only the named packages
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { Parser } from "tar";
import { Package, checkPackage } from "@arethetypeswrong/core";
import { TYPED_PACKAGES } from "../tooling/typed-packages.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const packagesDir = path.join(rootDir, "packages");

// The packages are ESM-only and target bundler resolution (node16/nodenext is NOT a
// target). Under `bundler`, the only meaningful resolution failures are an entry that
// does not resolve at all (`NoResolution`) or an internal relative specifier that does
// not resolve (`InternalResolutionError`). `FalseCJS`/`FalseESM` are node16-scoped and
// never fire under bundler, so they are not gated. The PRIMARY post-migration gates are
// the empty-types content check (below) + publint; attw@bundler is cheap insurance
// against an unresolvable/extensionless declaration regression.
const GATING_PROBLEM_KINDS = new Set(["InternalResolutionError", "NoResolution"]);

// We only evaluate the modern bundler resolution mode.
const GATING_RESOLUTION_KINDS = new Set(["bundler"]);

// EMPTY-TYPES GUARD: attw passes any declaration file that *resolves*, even an
// `export {}` stub that re-exports nothing (every public symbol then resolves to
// `any`). That false-green shipped @comvi/solid with empty types. So we also assert
// each declared types entry has real content. Anything at/below this byte count, or
// whose code (comments/whitespace stripped) is only `export {}`, is treated as empty.
const TRIVIAL_DTS_BYTES = 16;

// Gather every declaration file a consumer can resolve: the root `types`/`typings`
// plus every `types` condition anywhere in the `exports` map.
function collectTypesEntries(manifest) {
  const entries = new Set();
  if (typeof manifest.types === "string") entries.add(manifest.types);
  if (typeof manifest.typings === "string") entries.add(manifest.typings);
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [key, val] of Object.entries(node)) {
      if (key === "types" && typeof val === "string") entries.add(val);
      else walk(val);
    }
  };
  walk(manifest.exports);
  return [...entries];
}

// True when a .d.ts has no real declarations (empty, or only an `export {}` marker).
// Strips block comments and `//` line comments, but PRESERVES `/// <reference ... />`
// triple-slash directives — a reference-only .d.ts entry is meaningful, not empty.
function declarationIsEmpty(text) {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!\/)\/\/(?!\/)[^\n]*/g, "")
    .replace(/\s+/g, "");
  return stripped === "" || stripped === "export{}" || stripped === "export{};";
}

// `pnpm pack` the package into a temp dir and return the tarball's absolute path.
function packTarball(packageDir, destDir) {
  const stdout = execFileSync("pnpm", ["pack", "--pack-destination", destDir], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // `pnpm pack` prints the created filename on the last non-empty stdout line.
  const printed = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (printed && printed.endsWith(".tgz")) {
    return path.isAbsolute(printed) ? printed : path.join(destDir, path.basename(printed));
  }
  // Fallback: pick the single .tgz pnpm just wrote into destDir.
  const tgz = readdirSync(destDir).filter((f) => f.endsWith(".tgz"));
  if (tgz.length !== 1) {
    throw new Error(`expected exactly one .tgz in ${destDir}, found ${tgz.length}`);
  }
  return path.join(destDir, tgz[0]);
}

// Decompress + untar in memory, returning the attw-shaped file map:
// keys are `/node_modules/<name>/<path-after-tarball-prefix>`, mirroring attw's own
// `extractTarball` so `new Package(files, name, version)` resolves identically.
async function buildFileMap(tarballPath, packageName) {
  const gz = await readFile(tarballPath);
  const tarBytes = gunzipSync(gz); // single-shot — no fflate chunk-loss bug
  const files = {};
  let prefix;

  const parser = new Parser();
  const done = new Promise((resolve, reject) => {
    parser.on("entry", (entry) => {
      if (entry.type !== "File") {
        entry.resume();
        return;
      }
      // Tarball entries are `package/<...>`; capture the prefix from the first entry.
      const name = entry.path;
      if (prefix === undefined) {
        const slash = name.indexOf("/");
        prefix = slash >= 0 ? name.slice(0, slash + 1) : "";
      }
      const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name;
      const key = `/node_modules/${packageName}/${rest}`;
      const chunks = [];
      entry.on("data", (c) => chunks.push(c));
      entry.on("end", () => {
        files[key] = new Uint8Array(Buffer.concat(chunks));
      });
    });
    parser.on("end", resolve);
    parser.on("error", reject);
  });

  parser.end(tarBytes);
  await done;
  return files;
}

// Check one package; returns { name, problems: [...gating problems...] } or throws.
async function checkOne(pkg) {
  const packageDir = path.join(packagesDir, pkg);
  const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  const packageName = manifest.name;
  const packageVersion = manifest.version;

  const tmp = mkdtempSync(path.join(tmpdir(), "attw-"));
  try {
    const tarballPath = packTarball(packageDir, tmp);
    const files = await buildFileMap(tarballPath, packageName);

    // FALSE-GREEN GUARD: a "0 problems" verdict is only trustworthy if extraction
    // actually produced files (and the manifest) for attw to resolve against.
    const fileCount = Object.keys(files).length;
    if (fileCount === 0) {
      throw new Error(
        `extracted file map is EMPTY for ${packageName} — refusing to trust a verdict`,
      );
    }
    if (!(`/node_modules/${packageName}/package.json` in files)) {
      throw new Error(
        `extracted file map for ${packageName} has no package.json — extraction is broken`,
      );
    }

    const pkgObj = new Package(files, packageName, packageVersion);
    const result = await checkPackage(pkgObj);

    if (result.types === undefined || result.types?.kind === undefined) {
      // UntypedResult — no types at all. For a dual TS package that is itself a problem.
      throw new Error(`${packageName}: attw reports no types (UntypedResult)`);
    }

    // EMPTY-TYPES GUARD: every declared types entry must have real content. Catches the
    // `export {}` stub class that attw resolves but that leaves all symbols as `any`.
    const emptyTypes = [];
    for (const rel of collectTypesEntries(manifest)) {
      const key = `/node_modules/${packageName}/${rel.replace(/^\.\//, "")}`;
      const bytes = files[key];
      if (bytes === undefined) {
        emptyTypes.push({ entry: rel, reason: "missing from published tarball" });
        continue;
      }
      const text = Buffer.from(bytes).toString("utf8");
      if (bytes.length <= TRIVIAL_DTS_BYTES || declarationIsEmpty(text)) {
        emptyTypes.push({
          entry: rel,
          reason: `empty/trivial declaration (${bytes.length} bytes)`,
        });
      }
    }

    const problems = (result.problems ?? []).filter((p) => {
      if (!GATING_PROBLEM_KINDS.has(p.kind)) return false;
      // Resolution-scoped problems carry resolutionKind; gate only the bundler mode.
      if (p.resolutionKind) return GATING_RESOLUTION_KINDS.has(p.resolutionKind);
      if (p.resolutionOption) return p.resolutionOption === "bundler";
      return true;
    });

    return { name: packageName, fileCount, problems, emptyTypes };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : TYPED_PACKAGES;

let failed = false;
for (const pkg of targets) {
  try {
    const { name, fileCount, problems, emptyTypes } = await checkOne(pkg);
    if (problems.length === 0 && emptyTypes.length === 0) {
      console.log(`PASS ${name}: 0 gating problems (${fileCount} files extracted)`);
    } else {
      failed = true;
      console.error(`FAIL ${name}: ${problems.length + emptyTypes.length} gating problem(s):`);
      for (const p of problems) {
        const where = p.resolutionKind ?? p.resolutionOption ?? "";
        // FilePairProblem (FalseCJS/FalseESM) carries types/implementation file names;
        // InternalResolutionError carries the offending file + module specifier.
        const detail =
          p.kind === "InternalResolutionError"
            ? ` ${p.fileName} → '${p.moduleSpecifier}'`
            : p.typesFileName
              ? ` ${p.typesFileName} vs ${p.implementationFileName}`
              : "";
        console.error(`  - ${p.kind} [${where}]${detail}`);
      }
      for (const e of emptyTypes) {
        console.error(`  - EmptyTypes ${e.entry}: ${e.reason}`);
      }
    }
  } catch (err) {
    failed = true;
    console.error(`ERROR ${pkg}: ${err.message}`);
  }
}

if (failed) {
  console.error("\nattw type-resolution check FAILED.");
  process.exit(1);
}
console.log(`\nattw type-resolution check passed for ${targets.length} package(s).`);
