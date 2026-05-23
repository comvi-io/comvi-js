#!/usr/bin/env node
// Runs publint against every PUBLISHED package's packed tarball and aggregates the
// verdict. Mirrors the discovery + `private === true` skip of check-package-contracts.mjs
// so the two contract checks cover the same fleet. publint independently catches the
// false-CJS class (a `require` condition resolving to ESM-flavored types) plus
// engines/repository nits — see .omc/plans/types-attw-publint.md Step 4.
//
// We lint the PACKED tarball (`pack: 'pnpm'`), not the source tree, to validate exactly
// what publishes — the same philosophy as audit:package-contracts. Run after `pnpm build`
// (publint inspects the built dist that the tarball includes).
//
// Exit code: non-zero if ANY package emits an `error` or `warning` message. `suggestion`
// messages are printed but do not fail the run (cosmetic nits should not muddy the gate).
// Pass `--strict` to also fail on suggestions.
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { publint } from "publint";
import { formatMessage } from "publint/utils";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const packagesDir = path.join(rootDir, "packages");

const strict = process.argv.includes("--strict");
// Messages at or above this level fail the run. `suggestion` is informational only
// unless --strict is passed.
const FAILING_LEVELS = strict
  ? new Set(["error", "warning", "suggestion"])
  : new Set(["error", "warning"]);

const packageDirs = (await readdir(packagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name))
  .sort();

let failed = false;
let checked = 0;

for (const packageDir of packageDirs) {
  const manifestPath = path.join(packageDir, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    continue; // no package.json — not a package dir
  }
  if (manifest.private === true) continue;

  const packageName = manifest.name ?? path.basename(packageDir);
  // `pack: 'pnpm'` packs via pnpm so the linted file set equals the published tarball.
  const { messages, pkg } = await publint({ pkgDir: packageDir, pack: "pnpm" });
  checked += 1;

  const failing = messages.filter((m) => FAILING_LEVELS.has(m.type));
  const suggestions = messages.filter((m) => m.type === "suggestion");

  if (failing.length === 0) {
    const extra = !strict && suggestions.length > 0 ? ` (${suggestions.length} suggestion(s))` : "";
    console.log(`PASS ${packageName}${extra}`);
    // Surface suggestions for visibility without failing.
    if (!strict) {
      for (const m of suggestions) {
        console.log(`  suggestion: ${formatMessage(m, pkg) ?? m.code}`);
      }
    }
    continue;
  }

  failed = true;
  console.error(`FAIL ${packageName}: ${failing.length} message(s)`);
  for (const m of messages) {
    if (!FAILING_LEVELS.has(m.type) && m.type !== "suggestion") continue;
    const text = formatMessage(m, pkg) ?? m.code;
    console.error(`  ${m.type}: ${text}`);
  }
}

if (failed) {
  console.error(`\npublint check FAILED across ${checked} published package(s).`);
  process.exit(1);
}
console.log(`\npublint check passed for ${checked} published package(s).`);
