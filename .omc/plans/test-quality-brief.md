# Test-quality review & refactor — shared brief (js-sdk, branch feat/weight-refactor-0.5)

Repo: /Users/eugenebalabai/Projects/comvi/js-sdk (pnpm + turborepo, vitest 4, node:test in scripts/).
The owner wants EVERY test file reviewed and refactored against the manifest below. This is a
test-only change: production code under `src/` is out of scope (see C3).

## The manifest (owner's rules, made concrete for this repo)

### 1. Structure & design
- **AAA**: Arrange → Act → Assert, in that order, visually separated (blank lines). No
  `// Arrange` labels — the shape must be readable without them. Interleaved act/assert chains
  ("do X, expect, do Y, expect, do Z, expect") are a smell unless the test is explicitly a
  sequence/lifecycle scenario (then the name must say so).
- **One test = one scenario**: a test that asserts several UNRELATED behaviours is split. A table
  of closely related inputs for the SAME behaviour may stay together or become `it.each` with a
  name template that identifies the failing row.
- **Behaviour, not implementation**: no reaching into privates (`(x as any)._foo`, `x["_bar"]`,
  spying on internal helpers, asserting internal call order). Assert through the public contract:
  return values, emitted events, `onError`/callbacks that ARE the contract, DOM output, network
  requests made, files written. If the behaviour is only observable via a private, keep the test
  and tag the finding `needs-seam` (do not change src).
- **Minimal realistic data**: only inputs that influence the outcome. No 20-key catalogs when two
  keys suffice, no unused options, no fixtures with fields the test never reads.
- **No duplicated production logic**: expected values are literals (or the simplest possible
  derivation). A test that re-implements the algorithm under test to compute `expected` is rewritten.

### 2. Coverage (three dimensions per component)
Happy path, edge cases (empty string, zero, boundaries, missing optional input, unicode), error
path (invalid input → the documented error/fallback). This pass REPORTS gaps and adds tests only
when the gap is clear and the test is cheap and deterministic. New tests must follow every rule here.

### 3. Stability (flakiness prevention)
- **Independence**: no result depends on test order. Shared mutable state is created in
  `beforeEach` (or inside the test), never mutated at module scope across tests. Every global
  touched (`globalThis.*`, `document.body`, `localStorage`, `process.env`, `console`, timers,
  module singletons such as key mappings, template caches, syntax extensions) is restored in
  `afterEach`. Spies: `vi.restoreAllMocks()` in `afterEach` or config `restoreMocks`. Env vars:
  `vi.stubEnv` + `vi.unstubAllEnvs` (never hand-rolled save/restore around try/finally).
- **Determinism**: no `Date.now()`, `new Date()`, `Math.random()`, `performance.now()` that can
  influence an assertion — use `vi.useFakeTimers({ now })` / `vi.setSystemTime`, or pass a fixed
  value. Intl-based output (dates, numbers, plurals) is asserted with an explicit locale and, for
  dates, an explicit `timeZone`. Using `Date.now()` purely to build a UNIQUE id in an E2E spec is
  acceptable (it does not change the outcome) — say so instead of flagging it.
- **No artificial delays**: `await new Promise(r => setTimeout(r, N>0))`, msw `delay(N)` used to
  "win a race", `setTimeout(…, 300)`, polling with sleeps. Replace with fake timers
  (`vi.useFakeTimers` + `vi.advanceTimersByTimeAsync`/`vi.runAllTimersAsync`), deferred promises
  (`createDeferred` pattern — resolve from the test when YOU decide), `vi.waitFor`, or a named
  deterministic flush helper. A `setTimeout(r, 0)` / `requestAnimationFrame` used to flush
  MutationObserver/microtasks is a deterministic flush, not a sleep — allowed, but it must live in
  ONE named helper per package (e.g. `flushDOMMutations`), not be copy-pasted per file.
- **Stable selectors** (E2E/DOM tests): `data-testid`/roles/labels over CSS classes and deep
  XPath. In this repo: `apps/chrome-extension/gate-e/*.spec.ts` (Playwright) and the editor's DOM
  tests. Report class-based selectors; changing src to add `data-testid` is a `needs-seam` finding.

### 4. Debuggability & speed
- **Name = documentation**: "<subject> <condition/input> → <expected behaviour>". `it("works")`,
  `it("handles errors")`, `it("basic")`, `it("test 1")` are rewritten. A leading `should` is
  tolerated — do NOT mass-rename to strip it (see C2). Describe blocks name the unit
  (`describe("createI18n()")`, `describe("t() with missing params")`), not the file name.
- **Informative failure**: precise matchers (`toBe`, `toEqual`, `toStrictEqual`,
  `toThrow(/message/)`, `toHaveBeenCalledWith`) over `toBeTruthy`/`toBeDefined`/`toBeFalsy`
  (allowed only when presence IS the claim, e.g. `expect(el).not.toBeNull()` — prefer that form).
  Error paths use `expect(() => …).toThrow(ErrorClass)` / `await expect(p).rejects.toThrow(...)` /
  `.rejects.toMatchObject({ code })` — never `try { …; throw new Error("should have thrown") }
  catch (e) { expect(e)… }`. Assertions inside loops/forEach must identify the failing item
  (`it.each`, or `toEqual` on the whole collection, or a message via the matcher's context).
- **Speed**: no real waits ≥ 10 ms, no heavy setup repeated per test when it is immutable
  (`beforeAll` for immutable fixtures, `beforeEach` only for mutable state), no redundant
  render/mount when the assertion is on a pure function.

## Hard constraints
- **C1 — No claim lost.** Every existing test ID (`<file> > <full name>`) either survives, or is
  split into tests that together pin the same claims, or is a verified exact duplicate (name the
  surviving ID). Lock: `node <scratchpad>/tests/lock.mjs <packages/dir>` diffs the baseline IDs
  against `vitest list`. Every removed ID must be recorded in
  `<scratchpad>/tests/renames/<slug>.json` as `[{ "from": id, "to": [ids] | "duplicate-of:<id>", "why": "…" }]`
  — the lock fails on any removed ID without a row whose `to` targets exist.
- **C2 — Wrapper manifest gate.** `scripts/wrapper-test-manifest.json` pins test IDs of
  react/solid/svelte/vue/next/nuxt (`pnpm test-manifest`, ID-level). A renamed test there needs a
  `removals[]` row with `supersededBy` (and `addedIn` when the id is not in the baseline); a moved
  file needs a `renames[]` row `{ fromFile, toFile, minIds, reason }`. Therefore in those six
  packages: rename a test ONLY when its name is genuinely misleading, and add the row. The
  `reason` names the removed subject; copy the style of the existing rows.
- **C3 — Src is out of scope.** Editable: `tests/**`, `__tests__/**`, `gate-e/**`,
  `vitest.config.ts`, test `setup.ts`/helpers, `scripts/*.test.mjs`, the manifest JSON, the
  renames JSON. Not editable: `src/**` (even for a `data-testid`), `dist/**`, `package.json`.
  Tag such needs `needs-seam` in the report.
- **C4 — Comment rule (repo-wide, owner-signed):** no comments that retell the test. Keep one
  line only for "what regression this pins" / "why this odd setup" / a real gotcha. Never remove
  directive comments (`eslint-disable`, `@ts-expect-error`, `@vitest-environment`, `#region`).
- **C5 — No weakening.** No `.skip/.only/.todo`, no `expect.anything()`/`toBeTruthy` to paper
  over a precise claim, no dropping an assertion because it is inconvenient. When fake timers
  replace a real wait the claim stays identical.
- **C6 — Parity fixtures.** `T-structural` tests in react/solid/svelte/vue share fixture tables;
  keep their titles byte-identical across the four packages (manifest IDs).
- **C7 — Framework helpers.** react: `tests/test-utils.ts` (`setLocale`, `addTranslations`,
  `createDeferred` — act()-wrapped). editor: `tests/helpers.ts`, `tests/setup.ts`,
  `tests/fixtures.ts`, `tests/intersectionObserverMock.ts`. fetch-loader: msw `server` in
  `tests/setup.ts`. Reuse; add a helper when ≥ 2 files need the same thing.
- **C8 — Gates after each batch (package-scoped, never root builds):**
  `pnpm --filter <pkgname> test` (includes `test:types` where defined), `… typecheck`, `… lint`,
  `pnpm exec prettier --write <touched files>`, then the lock. Extension: `pnpm test` excludes
  `artifacts.test.ts`; `gate-e/*.spec.ts` are Playwright — review statically, do not run.
  `scripts/*.test.mjs`: `pnpm test:release-tools`, `pnpm test:size-tools`,
  `pnpm test:manifest-tools`, `pnpm test:perf-tools`.
- **C9 — Timing evidence.** Baseline `pnpm test` durations per package are in
  `<scratchpad>/tests/baseline/timings.json`; the final verification re-measures.

## Severity scale for findings
- **S1** — flaky or non-deterministic (sleep/real time/random/order dependence/unrestored
  global), error path that can pass without throwing, test that cannot fail.
- **S2** — implementation-coupled, several scenarios in one test, weak/uninformative assertion,
  misleading name, duplicated production logic, missing H/E/Err dimension that matters.
- **S3** — noise data, AAA shape, verbose naming, minor duplication.

## Review report format (pass 1) — `<scratchpad>/tests/findings/<lot>.md`
Read every file in the lot fully; report only verified findings (no grep-only claims).
```
## <file>   (N tests)
- L<line> [S1|S2|S3] [rule 1.x/2/3.x/4.x] <what is wrong> → <concrete fix>
- coverage: <component>: happy ✓ / edge ✗ (<missing case>) / error ✗ (<missing case>)
```
End with: (a) top-10 fixes by value, (b) anything tagged `needs-seam`, (c) files that are clean.
