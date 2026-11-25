#!/usr/bin/env node
// Published declaration files must explain the API to a user, not cite the project's
// own process: review rounds, lots, tickets, owner decisions, design-section numbers.
// Those comments reach a user's editor tooltips through every `.d.ts` in the tarball.
//
// This gate packs every publishable `packages/*` package with `pnpm pack` (the same
// tarball a user installs), reads each `.d.ts` / `.d.mts` / `.d.cts` inside it and
// fails on any match of DTS_INTERNAL_REF, printing package, file:line and the text.
// Other packed files (JS, maps, READMEs) are not scanned.
//
//   node scripts/check-dts-internal-refs.mjs           # every publishable package
//   node scripts/check-dts-internal-refs.mjs core vue  # only the named packages
//
// The pattern may only be made stricter. On top of the release plan's pattern it also
// catches `design §` wrapped across a comment line, `synthesis §n` and a dated `owner 30.10`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Parser } from "tar";
import { partition } from "../tooling/migration-pending.mjs";
import { TYPED_PACKAGES } from "../tooling/typed-packages.mjs";

export const DTS_INTERNAL_REF =
  /\bR[0-9]+-[0-9]+|\blot [0-9]|\breview [AB]\b|owner (decision|brief)|\bCodex\b|\bCOM-[0-9]+|\bMEDIUM [0-9]|\(H[0-9]+\)|design[\s*]+§|\bsynthesis §|\bowner [0-9]+\.[0-9]+/g;

export function isDeclarationFile(file) {
  return /\.d\.(ts|mts|cts)$/.test(file);
}

/**
 * Every match of DTS_INTERNAL_REF in the declaration files of `files`
 * (a Map of package-relative path → text), as { file, line, text }.
 */
export function scanDeclarations(files) {
  const matches = [];
  for (const [file, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isDeclarationFile(file)) continue;
    // The whole text, not line by line: a reference may be wrapped across two lines.
    const lines = text.split("\n");
    for (const match of text.matchAll(DTS_INTERNAL_REF)) {
      const line = text.slice(0, match.index).split("\n").length;
      matches.push({ file, line, text: match[0], source: lines[line - 1].trim() });
    }
  }
  return matches;
}

/** The files of a `.tgz` as a Map of path (without the `package/` prefix) → text. */
export async function readTarball(tarballPath) {
  const files = new Map();
  const parser = new Parser();
  const done = new Promise((resolve, reject) => {
    parser.on("entry", (entry) => {
      if (entry.type !== "File") {
        entry.resume();
        return;
      }
      const name = entry.path.replace(/^[^/]+\//, "");
      const chunks = [];
      entry.on("data", (chunk) => chunks.push(chunk));
      entry.on("end", () => files.set(name, Buffer.concat(chunks).toString("utf8")));
    });
    parser.on("end", resolve);
    parser.on("error", reject);
  });
  parser.end(gunzipSync(readFileSync(tarballPath)));
  await done;
  return files;
}

/**
 * Scan one tarball. A typed package (`requireDeclarations`) whose tarball holds no
 * declaration file is an error, not a pass: there would be nothing to scan.
 */
export async function scanTarball(tarballPath, { requireDeclarations = true } = {}) {
  const files = await readTarball(tarballPath);
  if (requireDeclarations && ![...files.keys()].some(isDeclarationFile)) {
    throw new Error(`${path.basename(tarballPath)}: no declaration file in the tarball`);
  }
  return scanDeclarations(files);
}

function packTarball(packageDir, destDir) {
  execFileSync("pnpm", ["pack", "--pack-destination", destDir], {
    cwd: packageDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tgz = readdirSync(destDir).filter((file) => file.endsWith(".tgz"));
  if (tgz.length !== 1) throw new Error(`expected one .tgz in ${destDir}, found ${tgz.length}`);
  return path.join(destDir, tgz[0]);
}

function publishablePackageDirs(root, only) {
  const packagesDir = path.join(root, "packages");
  return readdirSync(packagesDir)
    .sort()
    .map((name) => path.join(packagesDir, name))
    .filter((dir) => existsSync(path.join(dir, "package.json")))
    .filter(
      (dir) => JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).private !== true,
    )
    .filter((dir) => only.length === 0 || only.includes(path.basename(dir)));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const only = process.argv.slice(2);
  const { active } = partition(publishablePackageDirs(root, only), "check:dts-internal-refs");
  if (active.length === 0) throw new Error("no package to scan");
  let total = 0;
  for (const packageDir of active) {
    const name = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")).name;
    const tmp = mkdtempSync(path.join(tmpdir(), "comvi-dts-refs-"));
    try {
      // `@comvi/editor` ships a script bundle without types; it is packed and scanned too.
      const matches = await scanTarball(packTarball(packageDir, tmp), {
        requireDeclarations: TYPED_PACKAGES.includes(path.basename(packageDir)),
      });
      total += matches.length;
      for (const m of matches) {
        console.log(`${name} ${m.file}:${m.line}  ${JSON.stringify(m.text)}  | ${m.source}`);
      }
      console.error(`${name}: ${matches.length} match(es)`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  if (total > 0) {
    console.error(
      `\ncheck:dts-internal-refs: ${total} internal reference(s) in published declarations. ` +
        "Rewrite the source comment so it explains the behaviour without citing the process.",
    );
    process.exit(1);
  }
  console.error(`check:dts-internal-refs: ${active.length} package(s) clean.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
