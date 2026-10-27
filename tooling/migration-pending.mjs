/**
 * MIGRATION_PENDING — the one list of workspace packages that do not build against the
 * 0.8 core yet (reference-i18n rebuild, branch `next`; plan:
 * js-sdk/.omc/plans/reference-i18n-lot0-synthesis.md §4).
 *
 * Lot 1a replaced `@comvi/core` with the new compile/locale foundation; `createI18n`
 * and the instance arrive in lot 1b. Until a package's lot lands, every repo gate
 * leaves it out EXPLICITLY:
 *
 *   - turbo tasks (build, test, lint, typecheck, coverage): `scripts/turbo-active.mjs`
 *     appends `--filter=!<name>` for each entry;
 *   - per-package gates (package contracts, publint, types exports, inlined version,
 *     size rows): skip the entry and print it with its reason;
 *   - gates that exist only for pending packages (bundler matrix, strict consumer,
 *     node entries, docs snippet types, examples e2e, test-apps smoke, Gate E, perf
 *     A/B): `exitIfPending()` prints the reason and exits 0;
 *   - CI jobs that need a pending package read `node tooling/migration-pending.mjs
 *     --github-output` and are skipped.
 *
 * A lot that rebuilds a package REMOVES its entry here in the same PR; every gate then
 * covers it again without further edits. The list must be empty before 0.8.0 ships
 * (lot 10).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATION_PENDING = {
  "@comvi/react": "lot 1b/1c: React binding rebuilt on the new core (S9 commit model)",
  "@comvi/vue": "lot 4: Vue binding on the new core",
  "@comvi/solid": "lot 5: Solid binding on the new core",
  "@comvi/svelte": "lot 5: Svelte 5 runes binding on the new core",
  "@comvi/next": "lot 6: Next on the new core and @comvi/react",
  "@comvi/nuxt": "lot 7: Nuxt on the new core and @comvi/vue",
  "@comvi/plugin-fetch-loader": "lot 1b: replaced by @comvi/core/cdn (R3-11); removed in lot 2c",
  "@comvi/plugin-locale-detector":
    "lot 1b: replaced by @comvi/core/plugins (R3-11); removed in lot 2c",
  "@comvi/plugin-in-context-editor": "lot 8: editor on the internal hook v2",
  "@comvi/chrome-extension": "lot 8: depends on @comvi/plugin-in-context-editor",
  "@comvi/typegen":
    "lot 3: typegen v2 (Catalogs/KeysOf); its runtime-parity tests import the removed @comvi/core/icu",
  "@comvi/vite-plugin":
    "lot 3: typegen v2; its runtime-parity tests import the removed @comvi/core/icu",
  "@test-apps/next": "lot 6: builds from @comvi/next",
  "@test-apps/next16": "lot 6: builds from @comvi/next",
  "@test-apps/nuxt": "lot 7: builds from @comvi/nuxt",
  "@test-apps/nuxt4": "lot 7: builds from @comvi/nuxt",
  "@test-apps/react": "lot 1c: builds from @comvi/react",
  "@test-apps/solid": "lot 5: builds from @comvi/solid",
  "@test-apps/svelte": "lot 5: builds from @comvi/svelte",
  "@test-apps/vue": "lot 4: builds from @comvi/vue",
};

/**
 * Documents (repo-relative) whose code fences use API that is MIGRATION_PENDING. A
 * README of a pending package is pending by its package; these are the others. Their
 * findings in `pnpm check:snippets` are reported as advisory `migration-pending/*`.
 */
const CORE_07_DOCS =
  "documents the 0.7 core API (createI18n, the capability subpaths); createI18n returns in lot 1b, the pages are rewritten in lot 10";
export const MIGRATION_PENDING_DOCS = {
  "packages/core/README.md": CORE_07_DOCS,
  "docs/design/composition.md": CORE_07_DOCS,
  "docs/design/formatting.md": CORE_07_DOCS,
  "docs/design/icu.md": CORE_07_DOCS,
  "docs/design/rich-text.md": CORE_07_DOCS,
  "docs/design/ssr.md": CORE_07_DOCS,
};

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Workspace package name of `packages/<dir>` / `apps/<dir>` / `test-apps/<dir>`, or the input. */
export function packageName(dirOrName) {
  if (dirOrName.startsWith("@")) return dirOrName;
  for (const base of ["", "packages", "apps", "test-apps", "tooling"]) {
    const file = path.join(ROOT, base, dirOrName, "package.json");
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")).name;
  }
  return dirOrName;
}

/** The reason `dirOrName` is pending, or `undefined` when it is active. */
export function pendingReason(dirOrName) {
  return MIGRATION_PENDING[packageName(dirOrName)];
}

/** Why a repo-relative document is pending, or `undefined`. */
export function pendingDocReason(file) {
  const rel = file.split(path.sep).join("/");
  if (MIGRATION_PENDING_DOCS[rel]) return MIGRATION_PENDING_DOCS[rel];
  const m = /^packages\/([^/]+)\/README\.md$/.exec(rel);
  return m ? pendingReason(m[1]) : undefined;
}

/** Splits `dirsOrNames` into active ones and pending ones; prints one line per skipped entry. */
export function partition(dirsOrNames, gate, log = console.log) {
  const active = [];
  const skipped = [];
  for (const entry of dirsOrNames) {
    const reason = pendingReason(entry);
    if (reason) skipped.push(entry);
    else active.push(entry);
    if (reason) log(`${gate}: skipping ${packageName(entry)} — MIGRATION_PENDING (${reason})`);
  }
  return { active, skipped };
}

/**
 * For a gate that only exists for packages that are pending: when any of `needs` is
 * pending, print why and exit 0.
 */
export function exitIfPending(gate, needs) {
  const pending = needs.filter((n) => pendingReason(n));
  if (pending.length === 0) return;
  console.log(`${gate}: skipped — MIGRATION_PENDING`);
  for (const n of pending) console.log(`  ${packageName(n)}: ${pendingReason(n)}`);
  console.log(
    "  (tooling/migration-pending.mjs; the gate re-enables when the list no longer names them)",
  );
  process.exit(0);
}

/** CI job switches: a job runs only when nothing it needs is pending. */
export const CI_JOBS = {
  extension: ["@comvi/plugin-in-context-editor", "@comvi/chrome-extension"],
  examples_e2e: [
    "@comvi/react",
    "@comvi/next",
    "@comvi/vue",
    "@comvi/nuxt",
    "@comvi/svelte",
    "@comvi/solid",
    "@comvi/plugin-fetch-loader",
    "@comvi/plugin-locale-detector",
  ],
  test_apps: ["@comvi/next", "@comvi/nuxt"],
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--github-output")) {
    const lines = Object.entries(CI_JOBS).map(
      ([job, needs]) => `${job}=${needs.some((n) => pendingReason(n)) ? "pending" : "active"}`,
    );
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
    console.log(lines.join("\n"));
  } else {
    for (const [name, reason] of Object.entries(MIGRATION_PENDING))
      console.log(`${name}: ${reason}`);
  }
}
