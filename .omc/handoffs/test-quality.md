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

## Round 4 (2026-09-01, `9814952`): fetch-loader + locale-detector + locale-routing
Same discipline as core; every accept hand-applied. fetch-loader 64.7 → 89.2 % raw / 100 % adjusted
(tests 115 → 182, 10 new subject files); locale-detector 78.9 → 96.5 % / 100 % (tests 50 → 71, the
default cookie serialization pinned as one literal); locale-routing 92.1 → 94.7 % / 100 %
(query-reconciliation edges). `accepted.json`: 267 entries. Remaining backlog for mutation work:
editor (1 408 survived / 853 nocov), wrappers (fix the src-vs-dist measurement first),
next (`--inPlace`), cli `src/commands/**` coverage, extension (667/1 444; gate-e invisible to
Stryker), `__DEV__: false` profile for prod `E_*` codes.

## Round 5 (2026-09-01): editor kill-pass
8 parallel lots in per-agent worktrees + one closing lot. Editor: raw 56.4 % → 89.4 % (91.0 % on
covered); adjusted **98.8 % / 99.7 %** — 4 694 killed, 0 unexplained survivors, 584 accepted
entries repo-wide, tests 651 → 1 361 (57 files). Previously untested modules covered from scratch:
useTranslationHighlighter (27 tests), comviHook (46 — pins the COMVI_READY handshake contract with
the extension), useTheme, ui variants, domHelpers, TranslationKeyEncoder, apiClient, api-config.
NEW REAL FINDINGS: `validation.ts` computes placeholder mismatches and feeds them into an EMPTY
`if` — the whole warning feature is dead code (needs `warnings[]` on ValidationResult, src fix);
`parseICUSelect` drops a character on unbalanced braces (`"male {He}"` → `{male:"H"}`), pinned as
is. Tooling lessons: static module-scope mutants are invisible to per-test coverage — kill them by
re-importing the module per test (`vi.resetModules()`); Stryker's vitest runner reuses the module
registry across mutants, so module-level memo caches hide analysis; hand-probes of expression
mutants must parenthesise the replacement (Stryker does); `kind: tooling:*` records runner
limitations honestly.

Update (2026-09-01, owner rule "real bugs get fixed, not pinned"): both editor defects are FIXED —
`parseICUSelect` off-by-one (`3f0f7ad`) and the dead placeholder-warning, now a real
`ValidationResult.warnings[]` (`a08dccd`+`0370ebf`); tests flipped to the correct behaviour and
proved red on the old code; changesets added. Standing rule recorded in AGENTS.md and memory:
a defect found by testing is reported loudly as a bug to fix; pinning "as is" is only a temporary
src-frozen-pass measure with an explicit BUG flag.

## Round 6 — CLI src/commands coverage (2026-09-01, commits bb7eaa9 + 5baabc3)

Scope chosen by owner: close the 585-untested-line gap in packages/cli/src/commands/** (classic
coverage, not a mutation kill-pass).

Delivered (2 parallel agents, same checkout — no hand-mutation, so no worktrees needed):
- 62 new tests (suite 212 → 274, 16 files, ~750 ms): commands-init (17), commands-generate-types (14),
  commands-pull (14), commands-push (17). Real ConfigLoader/ApiClient/TranslationSync/TypeGenerator
  over temp dirs; only fetch / readline / eventsource mocked; files asserted ON DISK.
- Shared test kit hoisted to tests/helpers.ts: ExitSignal (FIRST-exit-code memoization — commands
  re-exit(1) from their catch after the sentinel throw), stubProcessExit, captureConsole (both
  line-array and joined-string views), exact-pathname fetch router with afterEach
  assertNoUnexpectedRequests. PATHS/writeConfig/run* wrappers deliberately stayed per-file.

BUGS FOUND AND FIXED (red-proofed on old code first; changesets cli-init-no-overwrite [minor],
cli-push-forcemode-config [patch]):
1. comvi init silently overwrote an existing .comvirc.json (data loss: namespaces/locales/
   push/pull settings gone). Now refuses + exits 1 unless --force; ConfigLoader.defaultConfigPath()
   extracted so check and write target can't drift. RELEASE NOTE: scripts re-running init need --force.
2. init next-steps numbered 1,3,4,5 with a key configured; now contiguous, --watch demoted to hint.
3. push.forceMode in .comvirc.json was DEAD: --force-mode declared commander default "ask", so the
   flag always shadowed config. Config {"push":{"forceMode":"override"}} still died in CI with
   "requires an interactive terminal". Fixed by dropping the option default (help text keeps it).
4. (pre-existing, hidden) type error in tests/integration.test.ts it.each union — invisible because
   package tsconfig includes only src/**; typed the cases as ProjectSchema.

Open decisions for owner (NOT fixed, recorded):
- --check exits 1 for both "types outdated" and "TMS unreachable" (CI can't tell a blip from stale).
- invalid --force-mode exits 1 while other validation exits 4.
- push progress throttle unreachable (ApiClient calls onProgress once per bulk commit; docstring
  still describes per-key PUTs); dry-run Updated==Conflicts always equal; unreachable apiKey guards;
  generate-types/typegen byte-identical bodies should share one impl; init blames the API key for a
  malformed --api-url and writes it anyway; process.exit(0) right after console.log can truncate
  piped stdout.
- REPO-WIDE: pnpm typecheck covers src/** only — test files are never type-checked in any package.

Mutation re-measure (pnpm mutation packages/cli): adjusted 50.2% → 70.9% (covered 79.3%),
nocov 773 → 203. Commands now: pull 77.8 / push 75.0 / init 67.6 / generate-types 60.0 (residual
survivors are mostly cosmetic StringLiteral message texts the manifest says not to pin line-by-line).
Weakest remaining: logger.ts 2.9, GenerationReporter 39.0, cli/index.ts 46 nocov (entry runs
program.parse on import — needs subprocess or seam), ApiClient 70.6.

Gotchas learned: `pnpm mutation` takes packages/<dir> not bare name; process.chdir() unsupported in
Stryker's worker threads (use vi.spyOn(process,"cwd") — same honesty for clearDirectory's cwd guard);
a failed Stryker dry run leaves .stryker-tmp inside the package and vitest then runs every test TWICE
(suite showed 32 files/548 — delete .stryker-tmp before trusting counts).

## Round 7a — wrapper mutation measurement fix (2026-09-01, commit 0aa1181)

ROOT CAUSE of the skewed wrapper scores: Stryker's vitest-runner SILENTLY DROPS test files that
fail to load in its sandbox (.stryker-tmp copies only the package dir). React ran 55/163 tests,
svelte 51/147 — three load-breakers: (1) `../../../tooling/test-utils/fakeI18n` points outside
the package; (2) CORE_DIST alias `resolve(__dirname, "../core/dist")` — no sibling core in the
sandbox; (3) react tearing.test.tsx imported `../../next/src/...`. The dry run still reports
SUCCESS, so nothing ever surfaced. (Silent-drop residual: files that load-fail vanish from the
run without a trace — treat any dry-run count mismatch as a red flag.)

Fix: tooling/test-utils became the @comvi/test-utils workspace package (resolves via
node_modules symlink chain even from a sandbox; also unblocks packages/next, whose tests import
it too); configs resolve core dist via dirname(createRequire(import.meta.url).resolve("@comvi/core"))
(NOTE: "@comvi/core/package.json" is NOT exported — resolve the main entry); react got a
~next-src alias the same way. Build-artifact tests (react tests/dist/**, svelte
exports-smoke.test.ts) are now EXCLUDED under COMVI_MUTATION=1, which run.mjs sets — declared
policy instead of silent dropping (they test dist; exports-smoke even rebuilds the package in
beforeAll).

Honest baselines after fix (same tests, same src): react 36.1→63.2 (nocov 124→42),
solid 43.8→85.7 (41→5), svelte 35.6→79.7 (25→0), vue 68.3→72.4 (20→14). Dry runs: solid 129/129
and vue 214/214 complete; react 152 (excluded dist 2, fake-i18n-default-params covers no src,
js-contract dev/prod same-name dedupe); svelte 134 = 147 − 13 excluded.

Round 7b (kill-pass) in flight: 4 agents in worktrees (scratchpad tests/wrappers/wt/<pkg>,
node_modules symlinked, core/next dist copied real), targets: react 98+42, vue 67+14, solid 33+5,
svelte 24+0. Protocol: hand-probes parenthesised, accepted-entry proposals merged by lead only.

## Round 7b — wrapper kill-pass COMPLETE (2026-09-01, commits 4c950fb..0a95fa3)

ALL FOUR WRAPPERS AT 100.0% ADJUSTED (from the honest post-fix baselines):
- svelte 79.7 → 100.0 (118 killed, 0 accepted, 0 nocov; +15 tests, 147→162)
- solid  85.7 → 100.0 (264 killed, 2 accepted; +18 tests, 129→147 incl. listener-release patch)
- vue    72.4 → 100.0 (280 killed, 13 accepted, 0 nocov; +42 tests, 214→256)
- react  63.2 → 100.0 (344 killed, 36 accepted, 0 nocov; +60 tests, 163→223)
Repo accepted.json: 564 → 595 entries, every wrapper entry hand-applied (mutant in, full suite
observed green, restored byte-identically); stale entries pruned same-day.

REAL BUG FOUND AND FIXED (e891ff1 + changeset vue-haslocale-config-revision): vue's reactive
hasLocale() went stale after setDefaultNamespace() and disagreed with hasLocaleNow() — it tracked
only _cacheRevision while the default-namespace lookup is config; red-proven first, now also
tracks _configRevision like hasTranslation.

METHOD LESSONS (recorded for future passes):
1. covered ≠ killed: new tests move nocov mutants to covered-but-surviving; never close a lot on
   coverage deltas — re-run Stryker and enumerate. (React needed a round 2 for exactly this.)
2. Passive-read false negatives: svelte get(store) re-runs start; React rerender() re-reads
   getSnapshot; vue computeds recompute on access. Reaction claims need persistent
   subscribers/watchers collecting values over time or listener counts on the fake host —
   the vue bridge file was rewritten to watchers (62ae6a9), react audited clean, svelte's
   stores.ts:54 escapee (623879c) was caused by a get()->persistent-subscriber rewrite dropping
   the fresh-subscribe claim.
3. Stryker's mutant set drifts between runs (two proposed vue accepts matched mutants absent from
   the fresh set) — drop stale entries rather than keep them speculatively; reasons preserved in
   ACCEPTED.md.
4. Worktree protocol held: 4 agents, zero cross-contamination, src byte-identical everywhere;
   worktrees + wt-mut-* branches removed after closure.

Open (owner-gated) src suggestions from the lots: widen react ComponentsMap to the {tag|component,
props} config form (works at runtime, untypeable today); react capabilityHooks L92-96 uncovered
despite a 100% score (outside mutate globs?); the redundant string fast paths in react T.tsx /
useI18n.ts could be deleted instead of accepted (18 entries would fall away).

## Round 8 — __DEV__:false prod profile for core (2026-09-02, commits be1c2b1..15e1680)

Core vitest now has two projects: unit (dev) + prod (define __DEV__:false, tests/prod/**).
Prod suite: 50 tests across 8 files (E_* codes for loader/plugins/tags/defaultParams/host, the
D1 ICU literal fail-soft with full icuHit accounting, prod missingCapability wording, dev-only
guard divergences). Unit additions: exact dev-message claims, instance-level default onTagWarning
(previously NEVER covered), strict-dev warn text, getTextDirection cache-hit via an Intl.Locale
construction count. Core tests 1112 → 1166.

Registry: 24 gap:prod-build entries DELETED (their mutants now killed), 31 reclassified to
equivalent-across-both-builds, 5 new entries for tool-invisible static arms (i18n 55/58/61/263 +
808's warn-argument prod arm). gap:prod-build for core is now zero. TWO previously-unasserted
prod codes covered: E_LOCALE_NOT_SET, E_INSTANCE_DESTROYED. One real coverage gap fixed:
"tagInterpolation" was missing from the reserved default-params keys test.

HARD LESSON (recorded in ACCEPTED.md too): vi.resetModules() + dynamic import inside a test
re-runs module INITIALIZATION in the coverage window — every static mutant of the transitive
graph stops being ignoreStatic-ignored and is attributed to that single file (61 phantom
survivors appeared). NEVER close static-mutant nocov with re-import tests; assert the same
claims through the ordinary suite instead. The leaky file was deleted, all its claims re-homed,
and each of the 61 was hand-probed: killed by the suite or equivalent (36 probes, evidence in
scratchpad probe-results-lot3.json).

CONFIRMED by a fresh full no-incremental run (2026-09-02): core adjusted 100.0% — 2,912
killed, 0 real survivors, 0 nocov, 299 accepted, 0 stale entries. The 61 phantoms are back
under ignoreStatic, exactly as the hand-probes predicted.

## Round 9 — next + nuxt kill-pass COMPLETE (2026-09-02, commits 888d50f..10ce5872)

BOTH PACKAGES AT 100.0% ADJUSTED:
- next: 71.7 → 100.0 (629 killed, 38 accepted, 0 nocov; tests 217 → 308). The old "--inPlace
  needed" belief was WRONG: the sandbox breaker was the same __dirname/../ class as the wrappers
  (CORE_DIST + the @comvi/react src alias) — fixed via node_modules resolution (888d50f), normal
  sandbox works. Routing modules (hooks/Link/context) went 0% → 100/100 through the public
  navigation entry.
- nuxt: 67.9 → 100.0 (1,032 killed, 100 accepted mutants across 76 entries, 0 nocov; tests
  169 → 280). Two vite seams landed in vitest.config: import.meta.server/dev (behaviour-
  preserving defaults) and import.meta.hot (NOT preserving — vitest's hot is truthy, the global
  defaults undefined; HMR registration now runs only under a stubbed hot context, which is what
  makes the dispose teardown assertable). plugin.ts 41.9% → 100%.

NEW GENERAL LESSONS (recorded in ACCEPTED.md too):
1. A factory called at DESCRIBE scope captures config before the mutant switch arms —
   construction-time claims need the factory call inside the test body (next cookie/localePrefix).
2. expect(fn).toThrow(msg) PASSES when the thrown value is undefined — use a capture helper
   asserting instanceof Error wherever src returns the error its caller throws (next once-cell).
3. Standalone module-level vi.fn() stubs are NOT cleared by restoreMocks — calls accumulate and
   an earlier test's call can satisfy a later toHaveBeenCalledWith (explicit beforeEach mockClear).
4. Files with module-level MUTABLE state (next cache.ts `let cell`) join module-init mutants in
   the static class: hand-applied probes turn the suite red, but the runner cannot re-evaluate
   the module between activations.
5. Stryker emits no ConditionalExpression for ternary conditions that are bare identifiers /
   non-comparison binaries, and no ObjectLiteral for an already-empty {}.

Owner-gated src cleanups recorded, not made: useLocaleHead's three dead `|| { code: locale }`
fallbacks (three permanently-accepted mutants would vanish); createMiddleware's dead `q = "q=1"`
destructuring default and `|| "1"` (isNaN backstop covers both); nuxt capabilities.ts (pure
re-export, unmutated, 0% covered) deserves a smoke test some round.
