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
