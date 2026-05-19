# ADR 0003 — Suspense / `use()` integration

**Status:** DEFERRED (post-v0.3)
**Date:** 2026-05-19
**Scope:** v0.3 React surface — Open Question OQ-3 (Suspense / `use()` integration).

## Decision

**Defer** Suspense / `use()` integration to Wave 5+. v0.3 ships without an opt-in `suspense` provider prop. Users continue to hand-roll loading UIs against `useI18n().isLoading` / `useI18n().isInitializing` (or `useIsLoading()` post-W2b-ii).

## Drivers

1. **DX feature, not correctness.** Audit-rated P2. No correctness or perf bug is left open by deferring.
2. **Scope creep concern.** Architect's iter-1 review flagged Suspense integration as "DX feature pending product decision + measurement" — the audit had no measurement of demand and no failing scenario.
3. **API surface stability.** Adding a `suspense` provider prop now would lock in semantics (when does it throw? what's the recovery path?) before the user community signals what they actually need.

## Affected sites (potential)

| File                                  | Note                                                         |
| ------------------------------------- | ------------------------------------------------------------ | --- | ------------------------------------ |
| `packages/react/src/I18nProvider.tsx` | Would gain a `suspense?: boolean` prop.                      |
| `packages/react/src/useI18n.ts`       | Would throw a thenable on `isInitializing                    |     | isLoading` when suspense is enabled. |
| `packages/react/src/T.tsx`            | Would interact with the throw point on missing translations. |

## Alternatives considered

1. **Ship now with opt-in `<I18nProvider suspense>` prop.** Throws a thenable from `useI18n()` (or just `<T>`) when `isInitializing || isLoading`. Pros: first-class React 18+ pattern; eliminates hand-rolled loading state. Cons: requires users to author `<Suspense>` boundaries (footgun if missing); unclear interaction with retry on translation load failure. **Rejected** — needs design + user research.
2. **Document the manual pattern only.** Keep current API; ship a doc page showing the `<Suspense fallback={...}><App /></Suspense>` + `<I18nProvider>` pattern with manual `use(translationPromise)`. **Possible Wave 4 addition.**
3. **Defer entirely (CHOSEN).** No Suspense surface in v0.3.

## Why chosen (Defer)

- No correctness gain — `useIsLoading()` (W2b-ii additive selector) already gives consumers everything they need to hand-roll a suspense-like UI.
- No measurement gain — `render-counts.test.tsx` doesn't reveal a perf problem on loading boundaries that suspense would solve.
- Locking in API now risks shipping a footgun (`<Suspense>` boundary placement, recovery semantics) that is hard to revise without another SemVer-major.
- Wave 5 can revisit with explicit user-research signal.

## Consequences

- v0.3 docs do NOT recommend `<Suspense>` integration — README should call out that users wanting suspense behavior can wrap their root with `<Suspense>` and throw a promise from a custom data-loader that resolves when `i18n.isInitialized`. (Migration guide note.)
- Error Boundary recommendation deferred to Wave 5+ docs as well (audit Dim 11 P2 has a docs sub-finding for this; tracked in verification matrix).

## Follow-ups (Wave 5+)

- Design the `suspense?: boolean` provider prop, including:
  - Throw vs `use(promise)` semantics.
  - Error Boundary placement guidance.
  - Interaction with `useI18n().isLoading` (synchronous suspend or background suspend?).
- Spec a `useSetLocaleTransition()` hook returning `{ isPending, setLocale }` via `useTransition` (B4 in the breaking-change table).
- Build a user-research signal (GitHub issue thread, survey) to gather demand evidence before committing.
