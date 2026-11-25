/**
 * MIGRATION_PENDING — the one list of workspace packages that do not build against the
 * 0.8 core yet (reference-i18n rebuild, branch `next`; plan:
 * js-sdk/.omc/plans/reference-i18n-lot0-synthesis.md §4).
 *
 * Lot 1a replaced `@comvi/core` with the new compile/locale foundation, lot 1b added
 * `createI18n`, the instance and the `/cdn`, `/plugins`, `/format`, `/devtools` subpaths,
 * lot 1c rebuilt `@comvi/react` and moved the React and vanilla examples, lot 4 rebuilt
 * `@comvi/vue` and moved the Vue example and test app, lot 5 did the same for
 * `@comvi/solid` and `@comvi/svelte` with their SSR examples, lots 6–7 moved Next and Nuxt,
 * and lot 8 rebuilt `@comvi/editor` and the Chrome extension on protocol 2 (the list is empty
 * since then; the mechanism stays for the docs below until lot 10).
 * Until a package's lot lands, every repo gate leaves it out EXPLICITLY:
 *
 *   - turbo tasks (build, test, lint, typecheck, coverage): `scripts/turbo-active.mjs`
 *     appends `--filter=!<name>` for each entry;
 *   - per-package gates (package contracts, publint, types exports, inlined version,
 *     size rows): skip the entry and print it with its reason;
 *   - gates that need a package that may be pending (strict consumer, docs quickstart;
 *     the docs snippet gates report a pending package's README as advisory instead):
 *     `exitIfPending()` prints the reason and exits 0 (the perf A/B runs again since
 *     lot 1b, across core generations);
 *   - multi-shard gates (examples e2e per framework, test-apps smoke per app, bundler
 *     matrix per case) select their ACTIVE shards one by one (`activeShards()`), so a
 *     framework whose lot has landed is covered again at once; CI reads the active
 *     shards from `node tooling/migration-pending.mjs --github-output`.
 *
 * A lot that rebuilds a package REMOVES its entry here in the same PR; every gate then
 * covers it again without further edits. The list must be empty before 0.8.0 ships
 * (lot 10).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATION_PENDING = {};

/**
 * Documents (repo-relative) whose docs-snippets findings are advisory until stage D rewrites
 * them, each with the EXACT rule ids that are advisory there and why. Every other finding in
 * these documents, and every finding in any other document, blocks (`pnpm check:snippets`,
 * `pnpm check:snippets:types`; `scripts/check-snippets.mjs`). A README of a pending package is
 * advisory as a whole (`pendingReason`); none is pending today.
 *
 * Since stage D lot S1 the docs-snippets rules are 0.8 rules: they BAN the 0.7 forms
 * (`.use()` on the instance, `compiler: icuCompiler`, `i18n.init()`, the removed subpaths and
 * packages). So only pages that still document the 0.7 API are listed — the rules per page are
 * the ones it fails on 2026-11-25 (raw runner with `--typecheck`, `origin/next` 2c1989db) —
 * and each entry leaves with the lot that rewrites the page: S3 (core README), S5 (design
 * records). The pages already on the 0.8 API pass the 0.8 rules and are not listed.
 */
const CORE_07_DOCS =
  "documents the 0.7 core API (`.use()` composition, `i18n.init()`, the removed subpaths); the 0.8 API landed in lot 1b, the page is rewritten in stage D";
const core07 = (...rules) => ({ reason: CORE_07_DOCS, rules });
export const MIGRATION_PENDING_DOCS = {
  // `.use(installer)` as the composition verb, `@comvi/core/loader`, `@comvi/plugin-fetch-loader`,
  // `registerPlugin` (lot S5).
  "docs/design/composition.md": core07(
    "banned/register-plugin-without-plugins",
    "banned/removed-entry",
    "banned/unresolved-comvi-import",
    "banned/use-on-instance",
    "typecheck/error",
  ),
  // Formatters imported from the 0.7 `@comvi/core` root (lot S5).
  "docs/design/formatting.md": core07("banned/unresolved-comvi-import", "typecheck/error"),
  // `compiler: icuCompiler` from the 0.7 `@comvi/core/icu` (lot S5).
  "docs/design/icu.md": core07(
    "banned/icu-compiler",
    "banned/removed-entry",
    "banned/unresolved-comvi-import",
    "typecheck/error",
  ),
  // The 0.7 per-framework SSR helpers (`createNextI18n` and its siblings), `i18n.init()`,
  // `compiler: icuCompiler` (lot S5).
  "docs/design/ssr.md": core07(
    "banned/icu-compiler",
    "banned/instance-init",
    "banned/unresolved-comvi-import",
    "typecheck/error",
    "typecheck/sfc-error",
  ),
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

/**
 * Pending capabilities that are not a package of their own. `fixtures-08`: the examples,
 * test apps and bundler-matrix fixtures written against the 0.7 API (`.use()` composition,
 * the 0.7 subpaths). Each moves to `createI18n` of the 0.8 core in its binding's lot; the
 * ones already moved are listed in {@link ON_08} and no longer need the capability.
 */
export const PENDING_CAPABILITIES = {
  "fixtures-08":
    "examples, test apps and bundler-matrix fixtures still on the 0.7 API move to the 0.8 createI18n with their binding's lot",
};

/**
 * What lot 1c moved to the 0.8 API: the React and vanilla examples, and the core and React
 * cases of the bundler matrix; lot 4 the Vue example and the Vue bundler cases; lot 5 the Solid
 * and Svelte examples, their SSR recipes and their bundler cases; lot 6a the Next example,
 * its bundler cases and the two Next test apps; lot 7 the Nuxt example and the two Nuxt test apps.
 * `@test-apps/react` moved in lot 3b with `@comvi/vite-plugin` and `@test-apps/vue` in lot 4
 * (both are built and type-checked, not part of the test-apps smoke), and `@test-apps/solid`
 * and `@test-apps/svelte` in lot 5 (likewise).
 */
export const ON_08 = {
  examples: new Set([
    "react",
    "vanilla",
    "vue",
    "solid",
    "solidstart",
    "svelte",
    "sveltekit",
    "next",
    "nuxt",
  ]),
  bundlerCases: new Set([
    "core-default",
    "core-subpaths",
    "react-default",
    "react-format",
    "vue-default",
    "vue-format",
    "solid-default",
    "solid-format",
    "svelte-default",
    "svelte-format",
    "next-server-on-default",
    "next-client-default",
    "next-proxy",
  ]),
  testApps: new Set(["next", "next16", "nuxt", "nuxt4"]),
};

/** The reason `dirOrName` (a package or a PENDING_CAPABILITIES id) is pending, or `undefined`. */
export function pendingReason(dirOrName) {
  return PENDING_CAPABILITIES[dirOrName] ?? MIGRATION_PENDING[packageName(dirOrName)];
}

/**
 * Why a finding of `rule` in the repo-relative document `file` is advisory, or `undefined`
 * when it blocks: only a rule listed for that document in MIGRATION_PENDING_DOCS, or any rule
 * in the README of a pending package.
 */
export function pendingDocReason(file, rule) {
  const rel = file.split(path.sep).join("/");
  const entry = MIGRATION_PENDING_DOCS[rel];
  if (entry) return entry.rules.includes(rule) ? entry.reason : undefined;
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

/**
 * What one example of `examples/<name>` needs: the `@comvi/*` packages its package.json
 * declares, plus the 0.8 fixtures. Shards are selected ONE BY ONE, so a framework whose
 * lot has landed is covered again even while other frameworks are still pending.
 */
export function exampleNeeds(name) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "examples", name, "package.json"), "utf8"),
  );
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const comvi = deps.filter((d) => d.startsWith("@comvi/"));
  return ON_08.examples.has(name) ? comvi : ["fixtures-08", ...comvi];
}

/** What test app `test-apps/<name>` needs: itself (its workspace package) and the 0.8 fixtures. */
export const testAppNeeds = (name) =>
  ON_08.testApps.has(name) ? [`@test-apps/${name}`] : ["fixtures-08", `@test-apps/${name}`];

/** What bundler-matrix case `name` needs: the packages it packs, and the 0.8 fixtures unless moved. */
export const bundlerCaseNeeds = (name, packages) =>
  ON_08.bundlerCases.has(name) ? [...packages] : ["fixtures-08", ...packages];

/** The entries of `names` whose needs are all active; prints one line per skipped entry. */
export function activeShards(names, needsOf, gate, log = console.log) {
  return names.filter((name) => {
    const pending = needsOf(name).filter((n) => pendingReason(n));
    for (const n of pending)
      log(`${gate}: skipping ${name} — ${n} is MIGRATION_PENDING (${pendingReason(n)})`);
    return pending.length === 0;
  });
}

/** The examples-e2e matrix of .github/workflows/ci.yml: every framework × mode, plus SSR recipes. */
export const EXAMPLES_E2E_MATRIX = [
  ...["react", "next", "vue", "nuxt", "svelte", "solid", "vanilla"].flatMap((framework) =>
    ["default", "cdn"].map((mode) => ({ framework, mode })),
  ),
  // The SSR recipe examples read bundled catalogs only; --cdn leaves them out.
  { framework: "sveltekit", mode: "default" },
  { framework: "solidstart", mode: "default" },
];

/** The test apps of `pnpm test-apps:smoke` (scripts/test-apps-smoke/run.mjs APPS). */
export const TEST_APPS = ["next", "next16", "nuxt", "nuxt4"];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--github-output")) {
    const quiet = () => {};
    const examples = EXAMPLES_E2E_MATRIX.filter(
      (e) => activeShards([e.framework], exampleNeeds, "examples-e2e", quiet).length === 1,
    );
    const lines = [
      // A JSON matrix of the ACTIVE examples-e2e shards (`[]` when none is active).
      `examples_e2e_matrix=${JSON.stringify(examples)}`,
      // Comma-separated active test apps (empty when none is active).
      `test_apps=${activeShards(TEST_APPS, testAppNeeds, "test-apps-smoke", quiet).join(",")}`,
    ];
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
    console.log(lines.join("\n"));
  } else {
    for (const [name, reason] of Object.entries({ ...MIGRATION_PENDING, ...PENDING_CAPABILITIES }))
      console.log(`${name}: ${reason}`);
  }
}
