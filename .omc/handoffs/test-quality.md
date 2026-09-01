# Test-quality refactor — evidence (2026-08-29)

Rules: `.omc/plans/test-quality-brief.md` (the owner's manifest made concrete). Plan/decisions:
`.omc/plans/test-quality-refactor.md`.

## Numbers
| package | ids before → after | `pnpm test` before → after |
|---|---|---|
| core | 596 → 655 | 3.9 s → 4.1 s |
| plugin-in-context-editor | 547 → 651 | 5.2 s → 4.8 s |
| next | 204 → 217 | 3.1 s → 2.8 s |
| nuxt | 161 → 169 (+6 type tests now enforced) | 1.4 s → 3.0 s (now includes `test:types`) |
| react / solid / svelte / vue | 154→163 / 121→129 / 147→147 / 210→214 | ≈ unchanged |
| cli | 200 → 212 | **3.8 s → 0.9 s** (7 real sleeps → fake timers) |
| plugin-fetch-loader | 105 → 115 | 2.3 s → 1.7 s (msw `delay()` races → deferreds) |
| locale-detector / locale-routing / vite-plugin | 49→50 / 86→89 / 17→33 | ≈ unchanged |
| chrome-extension | 142 → 189 | 1.4 s → 1.1 s |
| scripts (node:test) | 126 → 212 | release-tools 1.6 s; perf-tools 24 s (unchanged, seam pending) |
Vitest ids 2 739 → 3 033; every removed id has a lock row (split / duplicate-of / type-test move);
wrapper manifest gate green with 6 new `removals[]` rows (45 total).

## Method
11 reviewer lots (read-only, every file read; S1 55 / S2 354 / S3 572) → 11 executor lots →
5 second-pass reviewers with mutation probes (every probed rewrite went red for the right reason)
→ 2 blockers + ~25 should-fix routed back to the original executors → final gates.

## Cross-cutting facts learned (worth knowing before the next test change)
- `restoreMocks/unstubEnvs/unstubGlobals: true` is now on in all 14 vitest configs. Consequences:
  `vi.spyOn` on an INHERITED member (`localStorage.setItem`) is not restored — spy the instance and
  restore in `finally`; a module-scope `vi.stubEnv` in a setup file is wiped after the first test —
  stub inside `beforeEach` (editor `tests/setup.ts` does this now); `vi.stubGlobal` in `beforeAll` is
  undone — the extension harness re-stubs `chrome` in `reset()`.
- `loadEnv` (cli) writes `process.env` directly; `unstubEnvs` cannot undo it — explicit snapshot.
- `%3$s` positional format in `it.each` titles is rendered literally by vitest (duplicate ids).
- The wrapper test-manifest is ID-level: any rename in react/solid/svelte/vue/next/nuxt costs a
  `removals[]` row with `supersededBy`; a moved file costs a `renames[]` row.

## Open — needs a `src/` seam or an owner decision (not done, by C3)
- core: `_resetTagWarnings()`; `_formatterCacheSize()` / `_resetFormatterCaches()`.
- editor: `data-comvi-overlay/tooltip` hooks on ElementHighlighter; a public way to observe Core
  registration + teardown order; `TranslationScanner` one-registry-pass claim; positional ctor of
  ElementHighlighter; `getMappingsBridge(host)`; `usePluralRules`/`useToast` cache/counter resets.
- next: export `useStoreRevision` (test imports react's src); export `RECOMMENDED_MATCHER`;
  `setRequestLocale` per-request isolation; `required`/`timeout` forwarding + init dedup only
  observable via spies; render-time mutation boundary asserted by regex over source.
- cli: `src/commands/**` + `src/cli/index.ts` (585 lines) have zero tests; cross-emitter parity
  with vite-plugin needs a dependency edge; `InMemoryFileSystem.keys()`.
- extension: `popup.html` has no `data-testid` (specs select by id); `withLock` not observable
  (6 tests poll); `chrome.runtime.lastError` branch in `bridge.ts` untestable as written; the
  `--exclude artifacts.test.ts` belongs in vitest.config, not package.json.
- scripts: `perf.mjs` needs an `--iters-scale`/injectable measurement seam — `test:perf-tools`
  spends 23 s measuring real time and flakes under machine load (seen twice this session, passes
  alone); `sync-peer-ranges.nextReleaseVersion()` ignores the `root` argument (latent bug);
  `test-manifest.listPackageTests` has no injection point for its "did not print JSON" path.
- wrappers: svelte real `svelte/server` coverage needs a second vitest project (owner's call);
  `describe("T.tsx")` in solid names the file (21 manifest rows to rename — rejected as S3).

## CI audit (2026-08-29, `eb05262` … `8ec1fc7`)
Owner: "прибираємо все, що тільки робить вигляд, що перевіряє". 12 jobs → 4 (`quality`, `tests`,
`build` = build → publint/attw → size 15 rows → bundler-matrix 64, `extension` = artifact + gate-e).
Deleted with their tooling (35 files, 4 077 lines): perf gate + `perf.test.mjs` (a 10 % threshold on
0.12 µs ops measured runner noise — A/A runs differed by 16 %; `pnpm perf` stays manual),
wrapper test-manifest gate + JSON, codemod "no-op on repo" job, coverage-% job, always-skipped
dispatch job, `check-release-plan.mjs` (633 lines of G7 prose gate) + `prose-guards.test.mjs`,
size sentinels/probes + `size-check.test.mjs`. Hot-path invariants replace the perf gate
deterministically (`packages/core/tests/features/hot-path-invariants.test.ts`, 8 tests, all
proved red). The 5 red jobs at `bd2edb7` were all CI wiring never observed on a runner: unit
tests of tools running before the build, turbo dependsOn missing `solid`, next needing
`locale-routing` dist.

Gate E on the merged `extension` job failed 3× deterministically while passing locally in the
same order: the artifact job's job-level `VITE_COMVI_API_BASE_URL=https://api.comvi.io` was
carried over; vite `loadEnv` prefers `process.env` over `.env.gate-e`, so the gate-e build shipped
`host_permissions: https://api.comvi.io/*`, the popup could not read `tab.url`, took `init()`'s
early return and rendered "not detected" although the service worker had `comviDetected: true`.
Found only after `expectPopupView()` started naming the popup's view, tab resolution and storage
(rule 4.2 — the bare "expected visible, received hidden" said nothing). Fix: env scoped to the
production build step + a gate-e build refuses a non-loopback API origin (observed failing).

## Mutation testing (Stryker 10, `pnpm mutation <pkg>`, manual tool)
locale-routing pilot 92 %. Core first run (15.6 min, 3 329 mutants): **69.4 %** — 2 159 killed,
57 timeout, 736 survived, 240 uncovered; worst: translate.ts 143 survived, i18n.ts 126,
tags.ts 117, compile-icu 66, parser 57, loader 40, params 31, format.ts 34 %, editor-bridge.ts
0 % (no tests). Kill-pass in progress in five lots (reports `mutation-A..E`).

## Mutation rounds 2–3 and the production-level pass (2026-08-30)
Core after the kill-pass (`fdba92e`): raw Stryker 87.3 %, adjusted 91.9 %, 213 real survivors.
Round 2: two auditors HAND-APPLIED all 100 accepted entries (suite run or differential fuzzing
through `t()` with 400k–800k generated ICU templates); verdicts: 55 equivalent, 32 gap:prod-build,
10 unnecessary (already killed by round-2 tests), **5 killable** — one hid an infinite loop
(`compile-icu.ts:124` on `"{n, plural, '{one'}"`), one a non-enumerable `setDefaultParams` key
bypass. Four executors resolved the 213 survivors: 12 killed by behaviour tests, 201 accepted with
hand-applied evidence (lot B: 74 via a 3 470-render differential corpus). Lesson: six agents
hand-mutating one checkout corrupt each other's verdicts — each got its own `git worktree`.
Round 3: three reviewers re-read all 94 core test files against the manifest (6 blockers:
formatter-cache tests green without their setup, 8 dead `dev|prod` alternations, a
`currentTestName`-keyed dedup workaround, the `window.__COMVI__` leak from default
`exposeGlobal`); fixers applied ~70 should-fixes, deleted 2 redundant files and 9 duplicate tests
(each with a named survivor), added `tests/setup.ts` (afterEach: `__COMVI__`, template cache,
warn-dedup sets, formatter caches) and three dev-only seams in src (`_resetMissingParamWarnings`,
`_resetTagWarnings`, `_formatterCacheSize`/`_resetFormatterCaches`; 0 B in prod).
**Final full run (non-incremental, 19.6 min): raw 88.6 % / 90.2 % covered; adjusted for the
audited accepted list 98.3 % / 99.1 % — 2 841 killed, 25 real survivors (being resolved), 24
uncovered; core tests 596 → 1 101 (95 files).**
Real bugs found by the whole pass: `t(key, { fallback })` → "" (fixed), gate-e env leak (fixed),
`sync-peer-ranges.nextReleaseVersion()` ignores `root` (open), `TF_HAS_*` dead writes in
translate.ts (open, −bytes), CLI vs vite-plugin type emitters diverge (open), prod `E_*` error
codes asserted by no test (open → `__DEV__: false` vitest project).

## Repo-wide mutation sweep (2026-09-01, measurement only)
score % / covered % / survived / nocov: core **98.9/99.7/0/24** · locale-routing 92.1/92.7/11/1 ·
vite-plugin 80.6/89.1/26/25 · locale-detector 78.9/79.6/46/2 · vue 68.3/73.3/73/20 ·
nuxt 67.9/71.7/303/60 · fetch-loader 64.7/70.5/147/45 · editor 56.4/67.5/**1408**/853 ·
cli 50.2/84.8/170/**773** (the nocov = untested `src/commands/**`) · solid 43.8/51.8/109/41 ·
react 36.1/53.5/119/124 · svelte 35.6/45.2/51/25 · extension 34.3/62.3/667/**1444** (gate-e is
Playwright — invisible to Stryker). Wrapper numbers are skewed low: js-contract/dist suites test the
BUILD while Stryker mutates src, and `.svelte` files are not mutated. `packages/next` cannot run in
Stryker's sandbox (pnpm workspace symlink breaks `@comvi/react` resolution in `.stryker-tmp`) — needs
`--inPlace`. Owner decision: full kill-pass now for fetch-loader + locale-detector + locale-routing
(round 4, in flight); editor/wrappers/cli-commands later.
