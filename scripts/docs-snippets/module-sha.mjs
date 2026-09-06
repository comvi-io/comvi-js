/**
 * Parity marker for the docs snippet gate (lot D2a).
 *
 * The module lives here, in js-sdk, next to the packages and the tooling it
 * reasons about. The www site is a different repository and needs the same
 * rules, so it carries a COPY (docs-0.5 plan §7.3 — publishing the module or
 * wiring a submodule is deferred to D2b). A copy with no check is a copy that
 * drifts, which is the exact failure this whole lot exists to stop, so both
 * sides hash the module files and compare against one marker that travels with
 * the copy:
 *
 *   - js-sdk asserts the marker matches ITS files (module-sha.test.mjs);
 *   - www asserts the marker matches ITS files (a vitest parity spec).
 *
 * Both green means the two directories are byte-identical, because they agree
 * with the same hash. Updating the copy is deliberate: change the module here,
 * run `node scripts/docs-snippets/module-sha.mjs --write`, copy all five files
 * across.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Hashed in this order; the marker file itself is not part of the hash. */
export const MODULE_FILES = ["extract.mjs", "lint.mjs", "run.mjs", "module-sha.mjs"];

export const MARKER_FILE = "MODULE_SHA";

export function computeModuleSha(dir) {
  const hash = createHash("sha256");
  for (const name of MODULE_FILES) {
    hash.update(name);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(dir, name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** The `SNIPPETS_MODULE_SHA` recorded in the marker, or `null` when absent. */
export function readMarker(dir) {
  const file = path.join(dir, MARKER_FILE);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").match(/^SNIPPETS_MODULE_SHA=([0-9a-f]{64})$/m)?.[1] ?? null;
}

export function writeMarker(dir) {
  const sha = computeModuleSha(dir);
  const body =
    "# Parity marker for scripts/docs-snippets — see module-sha.mjs.\n" +
    "# Regenerate with: node scripts/docs-snippets/module-sha.mjs --write\n" +
    `SNIPPETS_MODULE_SHA=${sha}\n`;
  fs.writeFileSync(path.join(dir, MARKER_FILE), body);
  return sha;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  if (process.argv.includes("--write")) {
    console.log(`docs-snippets: SNIPPETS_MODULE_SHA=${writeMarker(dir)}`);
  } else {
    console.log(computeModuleSha(dir));
  }
}
