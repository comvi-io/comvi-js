#!/usr/bin/env node
// attw (Are The Types Wrong?) wrapper that AVOIDS the broken attw CLI extractor.
//
// Why a wrapper: `@arethetypeswrong/core@0.18.2`'s `extractTarball` decompresses with
// `new Gunzip((chunk) => (unzipped = chunk))`, which keeps only the LAST fflate chunk.
// fflate streams ~128KB chunks, so any tarball that decompresses to >128KB (every one
// of ours) loses all but the final chunk → `untar([])` → `data[0].filename` throws
// `Cannot read properties of undefined (reading 'filename')`. This hits the CLI and
// every `createPackageFrom*` helper.
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
import { moduleSpecifiers } from "../tooling/dts-specifier-scan.mjs";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const packagesDir = path.join(rootDir, "packages");

// The meaningful resolution failures are an entry that does not resolve at all
// (`NoResolution`) or an internal relative specifier that does not resolve
// (`InternalResolutionError`). `FalseCJS`/`FalseESM` and `CJSResolvesToESM` are the
// expected shape of an ESM-only package under a CJS resolver, so they are not gated.
const GATING_PROBLEM_KINDS = new Set(["InternalResolutionError", "NoResolution"]);

// attw is asked about `bundler` AND `node16`.
//
// node16 was previously excluded, and that single omission is what let
// `@comvi/plugin-fetch-loader/cdn` ship `export * from './cdn/index'` — a specifier
// node16 cannot resolve, leaving the entry point with ZERO exported members and every
// consumer with `TS2305: ... has no exported member 'cdnLoader'`. attw reports it
// perfectly well (10 × `InternalResolutionError` on that package alone); the report was
// being filtered away here.
//
// Two fields carry the mode, and BOTH have to allow node16 or the filter below silently
// drops everything: entry-level problems (`NoResolution`) carry `resolutionKind`
// (`bundler` / `node10` / `node16-esm` / `node16-cjs`), while `InternalResolutionError`
// carries `resolutionOption` (`bundler` / `node10` / `node16`). `node10` stays out of
// both: these packages are ESM-only and deliberately unresolvable by a node10 consumer.
const GATING_RESOLUTION_KINDS = new Set(["bundler", "node16-esm"]);
const GATING_RESOLUTION_OPTIONS = new Set(["bundler", "node16"]);

// `svelte-package` emits `export { default as T } from "./T.svelte"`. attw reports that
// as an `InternalResolutionError` under node16 because bare `tsc` needs
// `allowArbitraryExtensions` to map `./T.svelte` onto `T.svelte.d.ts`. A Svelte consumer
// resolves it through the Svelte toolchain, and a node16 `tsc --skipLibCheck false` over
// the published package reports NO error for it — so it is an attw false positive here,
// not a shipped defect. Scoped as narrowly as it can be: this exact extension.
const ARBITRARY_EXTENSION_SPECIFIER = /\.svelte$/;

// EMPTY-TYPES GUARD: attw passes any declaration file that *resolves*, even an
// `export {}` stub that re-exports nothing (every public symbol then resolves to
// `any`). That false-green shipped @comvi/solid with empty types. So we also assert
// each declared types entry has real content. Anything at/below this byte count, or
// whose code (comments/whitespace stripped) is only `export {}`, is treated as empty.
const TRIVIAL_DTS_BYTES = 16;

// One broken barrel can strand hundreds of specifiers; print enough to act on.
const NODE16_REPORT_LIMIT = 10;

// Gather every declaration file a consumer can resolve: the root `types`/`typings`
// plus every `types` condition anywhere in the `exports` map.
//
// A `types` condition may hold a NESTED condition object rather than a path —
// `"types": { "production": "./dist/production.d.ts", "default": "./dist/index.d.ts" }`
// is how a package ships different declarations per runtime condition while still
// putting `types` first. Every branch of such an object is resolvable by some
// consumer, so all of them are collected; walking past a `types` key would silently
// drop them from the empty-declaration guard below.
function collectTypesEntries(manifest) {
  const entries = new Set();
  if (typeof manifest.types === "string") entries.add(manifest.types);
  if (typeof manifest.typings === "string") entries.add(manifest.typings);
  const addAllPaths = (node) => {
    if (typeof node === "string") entries.add(node);
    else if (node && typeof node === "object") Object.values(node).forEach(addAllPaths);
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [key, val] of Object.entries(node)) {
      if (key === "types") addAllPaths(val);
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

// ---------------------------------------------------------------------------
// NODE16 RESOLUTION PROBE — for the entries attw's walk cannot reach
// ---------------------------------------------------------------------------
// attw (above, now with `node16` allowed through the filter) is the PRIMARY node16
// gate and catches the extensionless-specifier defect everywhere it can see. This
// probe exists for the one place it cannot see: attw resolves entry points with a
// FIXED condition set (`import`, `types`, `node`, `default`), so a `types` branch
// living under a custom condition is never visited.
//
// @comvi/plugin-in-context-editor has exactly that shape:
//
//     "." : { "types": { "production": "./dist/production.d.ts",
//                        "default":    "./dist/index.d.ts" }, ... }
//
// attw walks `types.default` and stops. VERIFIED: un-qualify `production.d.ts` back
// to `export * from './entry-production'`, run attw across all four resolution modes,
// and it reports NOTHING — while any consumer resolving with the `production`
// condition gets an entry point with zero exported members. `collectTypesEntries`
// above deliberately collects EVERY branch of a nested conditional `types`, and this
// probe is what checks the branches attw skipped.
//
// It also names the damage shape, which attw does not:
//
//   * `export * from <unresolved>` — the star contributes NO names, so the entry
//     point ends up with zero exported members and every consumer import fails
//     with `TS2305: ... has no exported member`.
//   * `export { X } from <unresolved>` — X stays declared but binds to an
//     unresolved module, so it silently becomes `any`. Under the `skipLibCheck:
//     true` nearly every app sets, the consumer gets NO diagnostic: the package
//     looks typed and type-checks nothing.
const DECLARATION_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];

// node16 maps a JS specifier back onto its declaration file: `./x.js` → `x.d.ts`.
const DECLARATION_FOR_JS_EXT = { ".js": ".d.ts", ".mjs": ".d.mts", ".cjs": ".d.cts" };

// POSIX-join a tarball-map key with a relative specifier.
function joinKey(fromKey, specifier) {
  const segments = fromKey.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
}

// Resolve exactly as node16/nodenext ESM does: the specifier must name a FILE,
// with its extension. No substitution, no `/index` fallback.
function resolveNode16(files, fromKey, specifier) {
  const target = joinKey(fromKey, specifier);
  if (DECLARATION_SUFFIXES.some((suffix) => target.endsWith(suffix))) {
    return target in files ? target : null;
  }
  const ext = Object.keys(DECLARATION_FOR_JS_EXT).find((e) => target.endsWith(e));
  if (ext === undefined) return null; // extensionless — unresolvable under node16
  const declaration = target.slice(0, -ext.length) + DECLARATION_FOR_JS_EXT[ext];
  return declaration in files ? declaration : null;
}

// Walk the published declaration graph from every `types` entry; return every
// relative specifier that node16 cannot resolve.
function probeNode16(files, packageName, typesEntries) {
  const prefix = `/node_modules/${packageName}/`;
  const queue = typesEntries.map((rel) => prefix + rel.replace(/^\.\//, ""));
  const seen = new Set();
  const unresolved = [];

  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key) || !(key in files)) continue;
    seen.add(key);
    const text = Buffer.from(files[key]).toString("utf8");
    for (const { specifier, kind } of moduleSpecifiers(text)) {
      if (!specifier.startsWith(".")) continue;
      if (ARBITRARY_EXTENSION_SPECIFIER.test(specifier)) continue;
      const resolved = resolveNode16(files, key, specifier);
      if (resolved === null) {
        unresolved.push({ file: key.slice(prefix.length), specifier, kind });
      } else {
        queue.push(resolved);
      }
    }
  }
  return unresolved;
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
    const typesEntries = collectTypesEntries(manifest);
    const emptyTypes = [];
    for (const rel of typesEntries) {
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
      // A `./T.svelte` specifier is resolved by the Svelte toolchain, not by tsc's
      // extension substitution — attw flags it, node16 `tsc` does not. See the
      // constant's comment. This sits BEFORE the mode filter, so it suppresses the
      // specifier under `bundler` as well as `node16`. That is deliberate and costs
      // nothing: bundler resolution has never reported it, so there is no verdict to
      // lose, and one rule beats two that could disagree.
      if (p.moduleSpecifier && ARBITRARY_EXTENSION_SPECIFIER.test(p.moduleSpecifier)) return false;
      // Entry-level problems carry `resolutionKind`; InternalResolutionError carries
      // `resolutionOption`. Both must allow node16 or the whole node16 report is lost.
      if (p.resolutionKind) return GATING_RESOLUTION_KINDS.has(p.resolutionKind);
      if (p.resolutionOption) return GATING_RESOLUTION_OPTIONS.has(p.resolutionOption);
      return true;
    });

    const node16 = probeNode16(files, packageName, typesEntries);

    return { name: packageName, fileCount, problems, emptyTypes, node16 };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : TYPED_PACKAGES;

let failed = false;
for (const pkg of targets) {
  try {
    const { name, fileCount, problems, emptyTypes, node16 } = await checkOne(pkg);
    if (problems.length === 0 && emptyTypes.length === 0 && node16.length === 0) {
      console.log(`PASS ${name}: 0 gating problems (${fileCount} files extracted)`);
    } else {
      failed = true;
      const total = problems.length + emptyTypes.length + node16.length;
      console.error(`FAIL ${name}: ${total} gating problem(s):`);
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
      // Star re-exports first: those are the ones a consumer sees as TS2305.
      const ordered = [...node16].sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === "star" ? -1 : 1,
      );
      for (const u of ordered.slice(0, NODE16_REPORT_LIMIT)) {
        const effect =
          u.kind === "star"
            ? "export * contributes NO names → TS2305 in the consumer"
            : "named re-export silently degrades to any";
        console.error(`  - Node16Unresolved [node16-esm] ${u.file} → '${u.specifier}' (${effect})`);
      }
      if (ordered.length > NODE16_REPORT_LIMIT) {
        console.error(
          `  - ... and ${ordered.length - NODE16_REPORT_LIMIT} more unresolved specifier(s)`,
        );
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
