# Test-quality review & refactor — 2026-08-29 (branch feat/weight-refactor-0.5)

Owner's ask: review and refactor EVERY test in the repo against the "Маніфест якісних тестів"
(AAA · one scenario per test · behaviour not implementation · minimal data · no duplicated logic ·
happy/edge/error coverage · isolation · determinism · no sleeps · stable selectors · names as
documentation · informative failures · speed).

## Scope and baseline
230 test files: 14 vitest packages (2 739 listed ids, all green, slowest package 5.2 s) + 8 node:test
files in `scripts/` (126 tests). Baseline ids/timings: scratchpad `tests/baseline/`.

## Method (writer/reviewer separation)
1. Review pass — 11 read-only reviewer agents, one lot each, every file read fully; verified findings
   only: **S1 55 · S2 354 · S3 572** (`findings/<lot>.md`).
2. Execute pass — 11 executor agents on the same lots (disjoint files; helpers owned by one lot).
3. Verify pass — lock (no test id lost without a recorded successor), wrapper manifest gate, full
   `pnpm test:commit`, `test:release-tools`, timings vs baseline, independent reviewer of the diff.

## Decisions
- **D-T1** `restoreMocks + unstubEnvs + unstubGlobals: true` in every `vitest.config.ts` (14 files,
  all project blocks). Applied centrally before the execute pass; broke only 6 editor tests
  (mocks arranged once and expected to survive) — fixed by the editor-B lot, never by disabling it.
- **D-T2** Wrapper manifest gate stays ID-level; renames in react/solid/svelte/vue/next/nuxt only
  when the reviewer showed the name is misleading and no assertion fix exists. Approved id removals:
  react `tearing` Repro 4 (self-referential), react `T.test.tsx:151` duplicate, svelte
  `T-prop-forwarding:236` duplicate, vue `new-features:130` duplicate (+ any verified duplicate).
  Rejected: `describe("T.tsx")` batch rename (21 rows for an S3), cross-package file moves.
- **D-T3** `core/tests/features/infer-keys.test.ts` (11 type assertions enforced by nothing) moves to
  `tests/types/infer-keys.test-d.ts` under `tsconfig.test-types.json`; enforcement proven by a
  deliberate break.
- **D-T4** nuxt `types.test-d.ts` was enforced by nothing (`test:types` never invoked): one-line
  `package.json` exception — `"test": "vitest run && pnpm test:types"` like every other package.
- **D-T5** No `src/` edits in this pass. Every `needs-seam` finding is listed in §Open below.
- **D-T6** `scripts/perf.test.mjs` keeps its 23 s of real measurement (a seam in `perf.mjs` is the
  owner's call); `scripts/*.mjs` under test are not edited.
- **D-T7** Tests that cannot fail are rewritten to the claim their name makes; verified exact
  duplicates are deleted with a `duplicate-of` row (lock) and, in wrappers, a manifest row.

## Status
- [x] baseline · [x] review pass · [x] execute pass · [x] merge manifest rows (6 rows) ·
  [x] second-pass review with mutation probes (2 blockers, ~25 should-fix, all closed) ·
  [x] final gates (lock 14/14, manifest, test:commit, tooling, lint, format, typecheck, perf alone) ·
  [x] committed

## Open (owner decisions / follow-ups, not done here)
See `.omc/handoffs/test-quality.md` §Open (seams, owner decisions) and §Cross-cutting facts.
