# ADR 0004 — `<T>` generic preservation vs `React.memo` opt-out

**Status:** DEFERRED — measurement-gated (post-v0.3)
**Date:** 2026-05-19
**Scope:** v0.3 React surface — Open Question OQ-4 (`<T>` generic preservation vs `React.memo`).

## Decision

**Keep `React.memo(T)`** for v0.3. Removal is GATED on a tinybench measurement (advisory: p99 regression < +15%) plus an unchanged commit-count in `render-counts.test.tsx`. The tinybench harness is not built in W2b-ii. Reassess in Wave 5+ when the bench is in place.

## Drivers

1. **Generic preservation (DX).** `React.memo(TComponent) as React.NamedExoticComponent<TProps>` collapses the per-key generic narrowing at the JSX call site. Authors of `<T i18nKey="welcome" />` lose autocomplete / type-checking on `params` shape per key (it widens to the union of all key shapes).
2. **Memo benefit (perf).** Skips re-render when shallow-equal props haven't changed — but with typical inline `params={{...}}` and `components={{...}}` prop usage, this benefit is largely a no-op (every render produces a fresh object identity).
3. **Audit-noted ambiguity.** Without measurement, removing memo is uncalibrated — could regress per-render wall time even if commits are unchanged (Critic Delta 3 in iter 1).

## Affected sites

| File                       | Line | Change candidate                                                                                                                                             |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/react/src/T.tsx` | 356  | `export const T = React.memo(TComponent) as React.NamedExoticComponent<TProps>;` — remove `React.memo` wrapper; re-introduce TComponent's generic signature. |

## Alternatives considered

1. **Remove `React.memo` + reintroduce generic signature.** Pros: per-call key narrowing restored. Cons: uncalibrated perf impact; potential regression in tight `<T>` lists.
2. **Keep `React.memo` (CHOSEN for v0.3).** Pros: known stable perf profile. Cons: generic narrowing lost.
3. **Add a `Tg<K>` generic helper alongside.** Pros: opt-in narrowing for callers who want it. Cons: doubles the public API surface; teaches a second pattern; not the audit's recommendation.

## Why chosen (Keep memo, defer removal)

- W2b-ii's 2-context split + W1.4 allocation fix already address the largest perf wins in `<T>`. Removing memo trades a known stable perf profile for a generic-narrowing DX gain — worth doing only with measurement evidence.
- Critic's iter-2 verdict specifically required tinybench gating for this decision (Delta 3). The bench is not in place; without it the rule "memo removal allowed iff render-count identical AND p99 regression < +15%" cannot be evaluated.
- Per-key narrowing is a "nice to have" — strict typing of typed-key registries via `TranslationKeys` declaration merging is still in effect at the parent type level; the narrowing loss is at the `<T>` JSX site only.

## Consequences

- Per-call generic narrowing remains lost at `<T>` JSX sites. Users wanting strict params typing per key can use `useI18n().t` directly with a typed key:
  ```tsx
  const { t } = useI18n();
  t("welcome", { name: "Alice" }); // type-checked per key
  ```
- The `T.tsx:356` cast `as React.NamedExoticComponent<TProps>` continues to widen TProps to the union of `StrictTypedProps | PermissiveTProps`.

## Follow-ups (Wave 5+)

- Build the tinybench harness for `<T>` render cost (advisory measurement; ≥1000 iters; p50 / p99 reported).
- Re-run the gate: if memo removal shows render-count unchanged AND p99 regression < +15%, remove memo and reintroduce TComponent's per-key generic signature.
- If removal regresses, document the trade-off explicitly in the audit and close OQ-4 as "no action — generic narrowing trade-off accepted."
