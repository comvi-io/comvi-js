# T component bench — W4 advisory measurements

**Date:** 2026-05-19
**Branch:** chore/react-packages-audit
**ADR:** docs/adr/0004-T-generic-vs-memo.md (OQ-4)
**Plan:** docs/plans/v0.3-fix-everything.md (Wave 4 advisory gate)

> These numbers are advisory only; re-run via `pnpm test T.bench` in your environment for local comparison.
> Run command used: `VITEST_SILENT=false pnpm exec vitest run "T.bench" --reporter=verbose`

---

## Methodology

- Environment: happy-dom (matches `packages/react/vitest.config.ts`)
- Iterations: 1000 per case
- Timing: `performance.now()` (no external deps)
- Measurement: wall-time of `render(<Subject>)` + one `act(setLocaleAsync("fr"))` per iteration
- Tree size: 50 components per subject (matches render-counts.test.tsx baseline)
- Case 2 uses `TBare` — a structurally equivalent unwrapped function (same hooks, same code paths as `TComponent` in T.tsx) replicated in the test file since `TComponent` is not exported

---

## Results

| Case | Description                                        | p50 (ms) | p99 (ms) | Iterations |
| ---- | -------------------------------------------------- | -------- | -------- | ---------- |
| 1    | Memo-ON: 50 `<T>` (exported, `React.memo`-wrapped) | 1.3740   | 4.5290   | 1000       |
| 2    | Memo-OFF: 50 `<TBare>` (bare function, no wrapper) | 1.0930   | 3.9557   | 1000       |
| 3    | `useI18n()` consumer: 50 components                | 1.3287   | 4.1003   | 1000       |
| 4    | `useLocale()` consumer: 50 components              | 0.5790   | 3.7943   | 1000       |

---

## Cross-case analysis

| Metric                               | Value                                    |
| ------------------------------------ | ---------------------------------------- |
| Memo-ON p99                          | 4.5290 ms                                |
| Memo-OFF p99                         | 3.9557 ms                                |
| p99 regression (memo-off vs memo-on) | **-12.7%** (improvement, not regression) |
| Threshold per ADR 0004               | +15%                                     |
| Gate result                          | **PASS**                                 |

### Hook cost comparison (Cases 3 vs 4)

`useLocale()` p50 is 57% lower than `useI18n()` p50 (0.579 ms vs 1.329 ms), confirming the
2-context split (W2b-ii) delivers measurable per-render savings for locale-only consumers like
`<Link>` and `usePathname()`. p99 values converge (3.79 ms vs 4.10 ms) due to GC/scheduler
jitter dominating at the tail.

---

## Verdict

**OQ-4 CAN be reopened.**

Memo-OFF p99 is **-12.7% vs memo-ON** (i.e. the unwrapped component is actually faster at the
tail — React.memo's prop-comparison overhead costs more than it saves in the typical inline-props
usage pattern). This is well within the +15% advisory threshold defined in ADR 0004 and the
v0.3-fix-everything.md plan.

The gate condition is: `render-count identical AND p99 regression < +15%`.

- render-count: already verified in `render-counts.test.tsx` (50-`<T>` locale switch = 1 commit,
  unchanged by memo presence/absence since memo only prevents re-renders on _parent_ re-renders
  with identical props, not on context-driven updates).
- p99 regression: **-12.7%** (negative = improvement) — gate passes.

**Recommendation for Wave 5+:** Remove `React.memo(TComponent)` wrapper at `T.tsx:361` and
reintroduce the per-call generic signature on `TComponent`. Both the commit-count gate and the
advisory p99 gate support this change. Note this in ADR 0004 follow-ups — do NOT edit ADR 0004
directly until the Wave 5+ PR lands.

---

## Bench run command

```sh
cd packages/react
VITEST_SILENT=false pnpm exec vitest run "T.bench" --reporter=verbose
```

Bench file: `packages/react/tests/T.bench.test.tsx`
