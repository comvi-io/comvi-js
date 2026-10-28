/**
 * MIGRATION_PENDING — the one list of workspace packages that do not build against the
 * 0.8 core yet (reference-i18n rebuild, branch `next`; plan:
 * js-sdk/.omc/plans/reference-i18n-lot0-synthesis.md §4).
 *
 * Lot 1a replaced `@comvi/core` with the new compile/locale foundation, lot 1b added
 * `createI18n`, the instance and the `/cdn`, `/plugins`, `/format`, `/devtools` subpaths,
 * and lot 1c rebuilt `@comvi/react` and moved the React and vanilla examples.
 * Until a package's lot lands, every repo gate leaves it out EXPLICITLY:
 *
 *   - turbo tasks (build, test, lint, typecheck, coverage): `scripts/turbo-active.mjs`
 *     appends `--filter=!<name>` for each entry;
 *   - per-package gates (package contracts, publint, types exports, inlined version,
 *     size rows): skip the entry and print it with its reason;
 *   - gates that exist only for pending packages (bundler matrix, strict consumer,
 *     node entries, docs snippet types, examples e2e, test-apps smoke, Gate E):
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

export const MIGRATION_PENDING = {
  "@comvi/vue": "lot 4: Vue binding on the new core",
  "@comvi/solid": "lot 5: Solid binding on the new core",
  "@comvi/svelte": "lot 5: Svelte 5 runes binding on the new core",
  "@comvi/next": "lot 6: Next on the new core and @comvi/react",
  "@comvi/nuxt": "lot 7: Nuxt on the new core and @comvi/vue",
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
  "@test-apps/react":
    "lot 3: generates its types with @comvi/vite-plugin (typegen v2); its app moves to the 0.8 API with it",
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
  "documents the 0.7 core API (.use() composition, the capability subpaths); the 0.8 API landed in lot 1b, the pages are rewritten in lot 10";
const LINT_07_RULES =
  "on the 0.8 API since lot 1c; the docs-snippets rules still require the 0.7 composition (`.use(installer)`, `compiler: icuCompiler`) — they move to 0.8 with the docs in lot 10";
const CDN_08_ROOT =
  "its Connect to Comvi section is on the 0.8 API since lot 2c (`loader: cdn(url)` from @comvi/core/cdn, the 0.7 fetch loader is gone); the docs-snippets rules still require the 0.7 composition (`.use(installer)`) — they move to 0.8 with the docs in lot 10";
export const MIGRATION_PENDING_DOCS = {
  "README.md": CDN_08_ROOT,
  "packages/core/README.md": CORE_07_DOCS,
  "packages/react/README.md": LINT_07_RULES,
  "examples/README.md": LINT_07_RULES,
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

/**
 * Pending capabilities that are not a package of their own. `fixtures-08`: the examples,
 * test apps and bundler-matrix fixtures written against the 0.7 API (`.use()` composition,
 * the 0.7 subpaths). Each moves to `createI18n` of the 0.8 core in its binding's lot; the
 * ones already moved are listed in {@link ON_08} and no longer need the capability.
 */
export const PENDING_CAPABILITIES = {
  "fixtures-08":
    "examples, test apps and bundler-matrix fixtures still on the 0.7 API move to the 0.8 createI18n with their binding's lot (vue: lot 4, solid/svelte: lot 5, next: lot 6, nuxt: lot 7, the editor: lot 8)",
};

/**
 * What lot 1c moved to the 0.8 API: the React and vanilla examples, and the core and React
 * cases of the bundler matrix. `@test-apps/react` stays pending on its own entry (it
 * generates its types with `@comvi/vite-plugin`, typegen v2 in lot 3).
 */
export const ON_08 = {
  examples: new Set(["react", "vanilla"]),
  bundlerCases: new Set(["core-default", "core-subpaths", "react-default", "react-format"]),
  testApps: new Set(),
};

/** The reason `dirOrName` (a package or a PENDING_CAPABILITIES id) is pending, or `undefined`. */
export function pendingReason(dirOrName) {
  return PENDING_CAPABILITIES[dirOrName] ?? MIGRATION_PENDING[packageName(dirOrName)];
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

/** CI job switches for single-shard jobs: a job runs only when nothing it needs is pending. */
export const CI_JOBS = {
  extension: ["@comvi/plugin-in-context-editor", "@comvi/chrome-extension"],
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--github-output")) {
    const quiet = () => {};
    const examples = EXAMPLES_E2E_MATRIX.filter(
      (e) => activeShards([e.framework], exampleNeeds, "examples-e2e", quiet).length === 1,
    );
    const lines = [
      ...Object.entries(CI_JOBS).map(
        ([job, needs]) => `${job}=${needs.some((n) => pendingReason(n)) ? "pending" : "active"}`,
      ),
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
