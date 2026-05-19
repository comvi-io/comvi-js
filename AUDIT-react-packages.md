# React Packages Audit — `@comvi/react` + `@comvi/next` (client surface)

Branch: `chore/react-packages-audit` · Date: 2026-05-18 · Method: source-read + measurement harness + concurrency repros · Source-modification: none (audit-only)

> **How to read this file.** This is the synthesis. Full per-dimension findings live in `packages/react/AUDIT-FINDINGS.md` (736 lines). Concurrency-pass details (4 repros, 7 test cases) live in `packages/react/AUDIT-CONCURRENCY.md`. New test files: `packages/react/tests/render-counts.test.tsx` (commit-counter harness, 12 tests passing) and `packages/react/tests/tearing.test.tsx` (concurrency repros, 7 tests passing).

---

## Executive summary

**Counts** (after concurrency-pass reclassifications)

| Severity                                                               |  Count | Notes                                                       |
| ---------------------------------------------------------------------- | -----: | ----------------------------------------------------------- |
| P0 — correctness / data loss / hooks-rule break                        |  **0** | None found.                                                 |
| P1 — concurrent-render hazard OR measurement-confirmed perf regression |  **2** | Both have ADR-level open questions.                         |
| P2 — DX, minor perf (code-read only), GC pressure speculation          | **14** | Several promotable to P1 with additional measurement.       |
| P3 — style, type tightening, React 19 soft-deprecation                 |  **8** | One downgraded from P2 by concurrency pass (test adequacy). |
| Open questions (ADR-grade)                                             |  **4** | OQ-1 through OQ-4.                                          |

**Tooling baseline (all clean)**

- `pnpm lint --max-warnings=0` clean for `@comvi/react` and `@comvi/next`
- `tsc --noEmit` clean for both
- Test suites: pre-existing 49 tests pass; new harness adds 12 commit-counter tests + 7 concurrency tests, all pass

**Top 3 themes (the audit's narrative)**

1. **Context fan-out on `cacheRevision` is the only measurement-confirmed perf bug.** The single `I18nContext` value triggers re-renders of _every_ `useI18n()` consumer on every namespace load — including consumers that never read translations (`<Link>`, `usePathname()`). Measured: 2 commits per namespace load on non-translation consumers vs the expected 0. Root cause: `cacheRevision` participates in the provider's `useMemo` deps at `packages/react/src/I18nProvider.tsx:170`. Fix: per-axis context split (Locale / Loading / Instance) backed by `useSyncExternalStore` selectors. (Dim 2 + Dim 4 P1; **OQ-2**.)

2. **`i18n.locale` is both a React store axis and a mutable global** — the dual role is the root cause of three coupled issues: render-time mutation in `next/client/I18nProvider.tsx:117-130`, hydration coupling, and a tearing-under-transition surface where `<T>` reads `i18n.locale` directly via `createBoundTranslation`. The concurrency-pass repros confirmed today's code is sound under the happy-dom harness (StrictMode double-invocation absorbed by the ref guard at `:122`); the architectural hazard remains and is ADR-bound. (Dim 3 P1 + Dim 5 P2 + Dim 6 P2; **OQ-1**.)

3. **Code quality is otherwise strong.** Hooks rules satisfied (lint + manual review). `useSyncExternalStore` discipline is correct (snapshots pure, subscribes stable for the i18n lifetime, SSR snapshots deterministic). `"use client"` boundaries correct in all six Next client modules. `sideEffects: false` honored. `forwardRef` on `<Link>` correct. SSR snapshot path matches between server and client today _because_ of the render-time mutation — any fix to theme 2 must preserve the hydration invariant.

---

## Per-file findings (severity-sorted)

### `packages/react/src/I18nProvider.tsx`

| Sev | Finding                                                                                                                                                                                                         | Where                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| P1  | `cacheRevision` in provider `useMemo` deps fans new context value to every consumer on namespace load — measurement-confirmed (2 commits on Stub `<Link>` / `usePathname` per `addActiveNamespace`)             | `:162-171` (and `:140-145`) |
| P3  | `useSubscribe` `useCallback([i18n])` closes over fresh `events` literal each call; works because every call site passes a static array, but a refactor passing dynamic events would silently break subscription | `:24-32`                    |
| P3  | `getServerSnapshot` returns are pure & deterministic; but SSR path is not exercised by the harness (happy-dom limitation)                                                                                       | `:136, 143, 150, 155`       |
| P3  | StrictMode double-effect handling for `autoInit` is sound (`isInitialized`/`isInitializing` flags absorb the duplicate)                                                                                         | `:115-126`                  |

### `packages/next/src/client/I18nProvider.tsx`

| Sev | Finding                                                                                                                                                                                                                                                                                                                                                          | Where      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | Render-time mutation of `i18n.locale` + `i18n.addTranslations(messages)` + ref write during render. Currently load-bearing for SSR/client locale agreement (removing without replacement = hydration mismatch). Concurrency repros confirm idempotency under StrictMode + identity guard; the tearing-under-transition surface is real but harness-indeterminate | `:115-130` |
| P3  | `useIsomorphicLayoutEffect` chooses at module load via `typeof window` — correct for Next App Router; edge-case fragile under heavy SSR harnesses                                                                                                                                                                                                                | `:7`       |
| P2  | No validation that `locale` prop is in the configured locales list; misconfigured app gets a confusing downstream error                                                                                                                                                                                                                                          | `:117-119` |

### `packages/react/src/useI18n.ts`

| Sev | Finding                                                                                                                                                                                                    | Where                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| P2  | `useI18n()` returns a fresh object identity per call; idiomatic per `useForm`/`useQuery`, but undocumented destructure-or-die contract — passing the whole return to `useEffect` deps re-runs every render | `:395-407` (also Dim 8 P3 docs gap) |
| P3  | `BIND_METHODS` loop uses imperative `Record<string, unknown>` + `any` cast; type-drift risk when methods are added                                                                                         | `:374-393`                          |
| P3  | Inner `t` allocates a closure via `useMemo([tRaw])` — stable, correct (positive observation)                                                                                                               | `:366-371`                          |

### `packages/react/src/T.tsx`

| Sev | Finding                                                                                                                                                                                                                   | Where       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| P2  | `useI18n()` called per-`<T>` — full hook cost paid 50× in measured tree; commit count is 1 (positive), but per-instance overhead is non-zero. Promotable to P1 with hook-cost measurement                                 | `:167-174`  |
| P2  | Per-render allocation of `reactHandlers = new Map()` and `tagHandlers = {}` even when `components` prop is undefined (the common case); 100 ephemerals per 50-`<T>` render. Promotable to P1 with GC-pressure measurement | `:188-189`  |
| P2  | `as any` casts on overload-narrowed `t`/`tRaw` calls. Functionally safe; `as never` is the standard idiom                                                                                                                 | `:179, 248` |
| P2  | `React.memo(T)` collapses generics — at the JSX site, `params` type is the union of all key shapes, losing per-key narrowing                                                                                              | `:356`      |
| P3  | `React.cloneElement` (React 19 soft-deprecation)                                                                                                                                                                          | `:218, 323` |
| P3  | Permissive `& Record<string, unknown>` on `TypedTProps` accepts typos (`<T i18nKey="x" naem="John" />`)                                                                                                                   | `:92-105`   |

### `packages/next/src/routing/Link.tsx`, `routing/hooks.ts`, `routing/context.tsx`

| Sev            | Finding                                                                                                                                                                            | Where                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| P1 (cross-ref) | `<Link>`, `useLocalizedRouter`, `usePathname` call `useI18n()` only for `locale` — inherit the full context subscription → re-render on every namespace load (Dim 4 P1 root cause) | `Link.tsx:36`, `hooks.ts:31, 95` |
| P3             | `<Link>` uses `forwardRef` + `displayName` correctly (positive observation)                                                                                                        | `Link.tsx:32-47`                 |
| P3             | `usePathname` early-return inside `if (routing)` is safe (all hooks run before the branch)                                                                                         | `hooks.ts:33-46`                 |

### `packages/react/src/index.ts`, `packages/next/src/client.ts`, `next/src/client/index.ts`

| Sev | Finding                                                                                                                               | Where                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| P2  | `next/src/client.ts` and `next/src/client/index.ts` duplicate re-exports — same surface, two files; will drift                        | both files           |
| P3  | `export type * from "@comvi/core"` is TS-only, zero bundle cost; `export { createI18n, I18n }` values tree-shake if unused (positive) | `react/index.ts:2-3` |

### Pre-existing tests (`packages/react/tests/*.test.tsx`)

| Sev | Finding                                                                                                                                                                          | Where |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| P2  | No pre-existing re-render-count assertion — gap NOW filled by `render-counts.test.tsx`                                                                                           | (gap) |
| P2  | No Next-provider `renderToString` + `hydrateRoot` round-trip test                                                                                                                | (gap) |
| P3  | No concurrent-rendering test — gap partially filled by `tearing.test.tsx`; full mid-commit observability requires non-happy-dom harness (downgraded from P2 by concurrency pass) | (gap) |

---

## Per-dimension verdicts (all 14)

1. **Hooks rules** — **Verdict: confirm.** Lint clean; manual review confirms no conditional / no loops / top-of-component. One fragile pattern (`useSubscribe` events) surfaced as P3.
2. **`useSyncExternalStore` discipline** — **Verdict: confirm with P1.** Subscribes stable, snapshots pure; cache snapshot causes fan-out (P1, Dim 4 root cause).
3. **Render side-effects** — **Verdict: open-question.** Next provider mutates during render (load-bearing for hydration). ADR (OQ-1).
4. **Re-render economy (measurement-gated)** — **Verdict: confirm with P1.** Measurement-confirmed cacheRevision fan-out.
5. **Hydration safety** — **Verdict: confirm.** Works today _because_ of the render-mutation in Dim 3; any fix must preserve invariant.
6. **React 18/19 concurrency** — **Verdict: open-question.** Tearing surface real (Dim 6 P2), harness-indeterminate. ADR (OQ-1).
7. **Memoization correctness** — **Verdict: confirm.** Correct end-to-end; two minor cleanups (events fragility P3, BIND_METHODS typing P3).
8. **Public API ergonomics** — **Verdict: confirm.** Spread-return idiomatic per Architect ruling; needs JSDoc destructure-warning (P3).
9. **Type safety** — **Verdict: confirm.** Strict/Permissive prop unions correct; `as any` could be `as never` (P2); `React.memo` collapses generics (P2, OQ-4).
10. **Bundle / tree-shaking** — **Verdict: confirm.** `sideEffects: false` honored, no deep imports; one source-duplication (P2).
11. **Suspense / Error Boundary integration** — **Verdict: open-question.** None present; feature decision. ADR (OQ-3).
12. **`<T>` perf (GC focus)** — **Verdict: confirm.** Per-render allocations (P2) + React 19 cloneElement (P3); promotable with GC measurement.
13. **Next RSC patterns** — **Verdict: confirm.** `"use client"` boundaries clean; render-mutation hazard is the Dim 3 cross-reference.
14. **Test adequacy** — **Verdict: confirm.** New harness + concurrency tests fill the biggest gaps; SSR round-trip + true mid-commit observability remain.

---

## Top-10 prioritized fix list

Ordered **correctness > perf > DX** per Principle 5. Ordering rationale per row.

|   # | Fix                                                                                                                                                                                         | Sev          | Why this order                                                                                                                                   |
| --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
|   1 | **Resolve OQ-1 ADR**: `i18n.locale` source-of-truth (render-immutable from React layer vs transition-safe queued mutation)                                                                  | P1           | Correctness — unblocks fix #2 and the tearing hazard at Dim 6 P2                                                                                 |
|   2 | **Refactor `next/client/I18nProvider.tsx:115-130` per ADR-1 outcome**: move sync into `useState(() => ...)` lazy initializer + `useLayoutEffect` for subsequent updates; preserve hydration | P1           | Correctness — eliminates render-time mutation; depends on #1                                                                                     |
|   3 | **Resolve OQ-2 ADR**: per-axis context split (Locale / Loading / Instance) backed by `useSyncExternalStore` selectors; keep `useI18n()` public API stable                                   | —            | Perf — unblocks fix #4                                                                                                                           |
|   4 | **Implement context split** to eliminate cacheRevision fan-out for non-translation consumers (`<Link>`, `usePathname`, etc.)                                                                | P1           | Perf (measurement-confirmed) — depends on #3; measurable success: Stub `<Link>` namespace-load commits drop from 2→0 in `render-counts.test.tsx` |
|   5 | **Memoize `<T>` per-render allocations** (`reactHandlers`/`tagHandlers`) — only allocate when `components` prop is provided                                                                 | P2           | Perf — independent of #1-#4; standalone S-effort win                                                                                             |
|   6 | **Fix `useSubscribe` fragility** (`...events: I18nEvent[]` rest + `events.join("                                                                                                            | ")` in deps) | P3                                                                                                                                               | Correctness (latent) — internal-only today but future-proofs against refactor footguns |
|   7 | **Tighten typing**: `as any` → `as never` in `<T>` translate calls; mapped-type for `BIND_METHODS` bag in `useI18n.ts`                                                                      | P2/P3        | DX — type-safety hardening, no behavior change                                                                                                   |
|   8 | **Document `useI18n()` destructure-warning** in JSDoc + add `@remarks` block about not passing the whole return to `useEffect` deps                                                         | P3           | DX — high ROI for size-S effort                                                                                                                  |
|   9 | **Resolve OQ-3 ADR**: Suspense + `use()` integration (opt-in `suspense?: boolean` provider prop?)                                                                                           | —            | DX — feature decision, can land later                                                                                                            |
|  10 | **Add missing tests**: Next-provider `renderToString` + `hydrateRoot` round-trip; effect-rerun-count harness; optional GC-pressure harness                                                  | P2/P3        | DX — coverage; promotes some P2 to P1 if regressions surface                                                                                     |

**Out of top 10 (deferred):** locale-prop validation (Dim 13 P2 — add when refactoring #2); `next/src/client.ts` duplication (Dim 10 P2 — S-effort cleanup); `React.cloneElement` migration (Dim 12 P3 — wait until React 20 raises the warning level).

---

## Breaking-change candidates (one row per change, no bundling)

|   # | Change                                                                                    | Rationale                                                                                   | Migration                                                                                                      | Target release                  | Dependent on                                |
| --: | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------- |
|  B1 | Drop React 16.8–17 peer support; bump to `react@^18.0.0 \|\| ^19.0.0`                     | Removes `use-sync-external-store` shim; enables React 18+ native APIs; reduces install size | Users on React 17 stay on `@comvi/react@^0.2.x`; SemVer-major bump; CHANGELOG migration note                   | `@comvi/react@0.3.0`            | — (independent)                             |
|  B2 | Remove `use-sync-external-store` shim dependency                                          | Smaller bundle; native `useSyncExternalStore` import in source                              | None for end users; internal import change                                                                     | `@comvi/react@0.3.0`            | B1                                          |
|  B3 | Adopt `use()` for translation suspense (opt-in via provider `suspense` prop)              | First-class Suspense integration for first-paint translation loading; resolves OQ-3         | Opt-in; no change for existing users                                                                           | `@comvi/react@0.4.0` (feature)  | B1 (depends on React 18.3+)                 |
|  B4 | Built-in `setLocaleTransition()` returning `{ isPending, setLocale }` via `useTransition` | UX: keep old tree visible during locale-load; common pattern users hand-roll today          | Additive; no breaking change in API; existing `setLocale` retained                                             | `@comvi/react@0.3.0` (additive) | B1                                          |
|  B5 | Per-axis context split (Locale / Loading / Instance) — internal refactor                  | Eliminates cacheRevision fan-out (Dim 4 P1)                                                 | Public `useI18n()` API unchanged; advanced selector hook `useI18nSelector()` added                             | `@comvi/react@0.3.0`            | OQ-2 ADR resolution                         |
|  B6 | Refactor `useI18n()` return identity (only if measurement justifies)                      | Eliminates whole-object-in-deps footgun for `useEffect` consumers                           | If implemented as memoized return: SemVer-minor (identity-stable is strictly looser); if reshape: SemVer-major | Defer (P3 docs-only for now)    | Measurement evidence (effect-rerun harness) |
|  B7 | Refactor `next/client/I18nProvider.tsx` render-time mutation per OQ-1                     | Eliminates render-side-effect; transition-safe                                              | Internal; public `<I18nProvider>` props preserved; preserves hydration invariant                               | `@comvi/next@0.3.0`             | OQ-1 ADR resolution + B1                    |

**Dependency graph:** B1 → {B2, B3, B4, B5, B7} (React-version baseline); B5 ↔ B7 (paired refactor, but independent files); B6 deferred pending measurement. No row depends on more than one other.

---

## ADR — Bound `i18n.t()` capture in React surface

### Decision

**Defer to discovery PR.** Resolve as: target Alternative 2 (replace bound capture with context-provided unbound `t` + locale selector) after measurement of effect-rerun cost vs current implementation. Until then, document the hazard and keep current behavior — concurrency pass confirms it's sound under StrictMode + happy-dom harness.

### Drivers

- **Render correctness under concurrent rendering** — tearing risk if `i18n.locale` is mutated mid-transition while `<T>` reads it directly via `createBoundTranslation`. Concurrency repros indeterminate in happy-dom but source-path is real.
- **Re-render economy** — identity stability of bound `t` is currently `[i18n, ns]`-stable, so this is not the perf bottleneck. The cache-fan-out (Dim 4 P1) is the perf bottleneck.
- **Hooks-rules compliance** — independent from this ADR; lint already passes.

### Affected sites

- `packages/react/src/useI18n.ts:363` — `createBoundTranslation(i18n, ns)` capture
- `packages/react/src/T.tsx:177-179` — `translate = tRaw ?? fallback`; `translate(keyString, transportParams)` at `:248`
- `packages/next/src/client/I18nProvider.tsx:117-130` — render-time `i18n.locale = locale` mutation
- `packages/react/src/I18nProvider.tsx:133-137` — `useSyncExternalStore` locale source

### Alternatives considered

1. **Keep bound capture, memoize per-locale.** Pros: minimal change, preserves identity. Cons: tearing surface remains; still requires `i18n.locale` to be in sync with React tree.
2. **Replace with context-provided unbound `t` + locale selector** _(recommended target)_. `<T>` calls `t(key, { locale, ... })` where `locale` is read from `useSyncExternalStore` (transition-safe). `i18n.locale` becomes a non-React default only. Pros: eliminates tearing surface; `next/client/I18nProvider.tsx` render-mutation becomes optional (locale flows via prop → context, not via instance state). Cons: cascade through `<T>`, `tRaw`, formatters; SemVer-major; ~M-L effort.
3. **`useSyncExternalStore` selector returning `{t, locale}` tuple.** Pros: one snapshot. Cons: snapshot purity rule violated (returns new object); requires custom equality; complex.
4. **Defer pending React 19 `use()` adoption.** Pros: simplest; lets React-side reads pull through a Promise-aware path. Cons: doesn't fix tearing on synchronous reads; ties this decision to B3.

### Why chosen (Alternative 2 target)

- Concurrency pass shows current code is sound _today_, but the source path for tearing is real and surfaces as soon as a real user adds `startTransition` around `setLocale`. Alternative 2 closes the gap structurally rather than relying on harness-indeterminate behavior.
- It also enables removing the render-time mutation in `next/client/I18nProvider.tsx:117-130` (B7 in the breaking-change table) by making `locale` flow through the React layer instead of being synced into instance state.
- Alternatives 1 and 3 are workarounds; Alternative 4 doesn't address the synchronous tearing surface.

### Consequences

- **Breaking change:** Internal API only if `t`/`tRaw` signatures gain an optional `{ locale }` field. Public `useI18n()` and `<T>` props unchanged.
- **Bundle impact:** Negligible — replacing one `useMemo` closure with a context read.
- **Downstream:** Enables B7 (remove render-time mutation in `next/client/I18nProvider.tsx`). Together they resolve Dim 3 P1, Dim 5 P2, Dim 6 P2 in one architectural change.

### Follow-ups

- Measurement: add effect-rerun-count harness asserting destructured-`locale` vs whole-object `useI18n()` (would promote Dim 4 P2 to P1 with concrete numbers).
- Decision: pair Alternative 2 with B5 (context split) since both target the same provider — single refactor PR.
- Open: does `formatNumber`/`formatDate`/`formatRelativeTime` need the same treatment? Today they read `i18n.locale` internally — same tearing surface, different blast radius. Track as separate follow-up.

---

## Verification checklist (audit done?)

- [x] Every P1+ has `repro` | `measurement` | `profiler-trace` evidence
      _Dim 4 P1: `measurement` (render-counts.test.tsx subjects B & C, namespace load = 2 commits). Dim 3 P1: concurrency repros confirm idempotency; hazard documented architecturally via OQ-1._
- [x] Every demoted finding has one-line justification
      _Dim 14 P2 → P3: covered by `tearing.test.tsx` (7 cases). Concurrency-pass synthesis table cites each downgrade._
- [x] ADR resolves `i18n.t()` open question
      _Defer-to-discovery-PR with explicit target = Alternative 2; affected sites enumerated; drivers + alternatives + consequences documented._
- [x] All 14 audit dimensions have a verdict line
      _See "Per-dimension verdicts" section above; each ends with **Verdict: ...**._
- [x] Breaking-change table has zero bundled rows
      _7 candidates (B1–B7); each row has its own rationale + migration + target release + dependent-on column._
- [x] Tearing repro attempted (commit linked) OR formal declaration documented
      _Attempted at `packages/react/tests/tearing.test.tsx` (4 repros, 7 cases, all pass). Repros 1 + 2 declared "architectural concern only" per attempt-then-declare rule; Repros 3 + 4 confirmed sound. Full details: `packages/react/AUDIT-CONCURRENCY.md`._

---

## Artifacts produced

| File                                          | Purpose                                                                                                                        | Lines |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----: |
| `packages/react/AUDIT-FINDINGS.md`            | Full per-dimension findings (14 dims)                                                                                          |   736 |
| `packages/react/AUDIT-CONCURRENCY.md`         | Concurrency-pass: 4 repros, 7 test cases, synthesis table                                                                      |   191 |
| `packages/react/tests/render-counts.test.tsx` | Commit-counter measurement harness (React `<Profiler>`, happy-dom, StrictMode policy)                                          |   473 |
| `packages/react/tests/tearing.test.tsx`       | Concurrency repros (startTransition + locale flip, aborted-transition leak, Next-provider idempotency, useSubscribe fragility) |   441 |
| `AUDIT-react-packages.md`                     | This synthesis                                                                                                                 |     — |

**Source files modified:** none. Audit is read-only. All artifacts are new files; commit grouping is at maintainer's discretion.

---

## Out of scope (confirmed)

- Implementing fixes — handled by a follow-up branch.
- Server-only Next code (`middleware/`, `server/`, `createNextI18n`, route generation utilities) — only React-facing client/routing surface audited.
- `@comvi/core` internals — only types/events consumed by React surface inspected.
- Vue / Solid / Svelte / Nuxt parity — separate audit branches.

---

## Coverage gaps remaining (for future work)

1. **True mid-commit DOM observability** (Repros 1 & 2 architectural hazards). Requires instrumented renderer (`onCommitFiberRoot`) or browser-based E2E (Playwright + Next dev server).
2. **SSR `getServerSnapshot` path** — pure-Node `renderToString` test outside happy-dom suite would directly exercise the server snapshot getters at `react/I18nProvider.tsx:136, 143, 150, 155`.
3. **Memory pressure under sustained transition churn** — would promote Dim 12 P2 to P1 with measurement.
4. **Hook-cost measurement per `<T>` instance** — would promote Dim 4 P2 (useI18n inside T) to P1 with measurement.
5. **Effect-rerun count, destructured vs whole-object `useI18n()`** — would promote Dim 4 P2 to P1 with concrete numbers; supports B6 decision.
