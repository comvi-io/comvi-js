# Audit verification matrix

Maps every finding in `AUDIT-react-packages.md` (2 P1 + 14 P2 + 8 P3 + 4 ADRs = **24 items**) to its closing PR + verifiable artifact + mode (`auto` = automated CI test/lint check, `manual` = JSDoc text or ADR doc, `n/a` = positive-observation finding requiring no action).

CI lint rule `tests/audit-matrix-coverage.test.ts` greps this file and asserts every row's `artifact` column resolves to either an existing file path or a unique test-id locatable via `grep -r`. Re-run via `pnpm test --filter @comvi/next audit-matrix-coverage`.

---

## P1 findings (2)

| #   | Finding                                                                                                                               | File                                                | Closing wave | Artifact                                                                                          | Mode |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------- | ---- |
| 1   | Dim 4 P1 — `cacheRevision` fan-out to non-translation consumers (measurement-confirmed Link/usePathname commit 2× per namespace load) | `packages/react/src/I18nProvider.tsx:162-171`       | W2b-ii       | `packages/react/tests/render-counts.test.tsx` — Subject B & C "consumer body does NOT re-execute" | auto |
| 2   | Dim 3 P1 — render-time mutation of `i18n.locale` + `i18n.addTranslations` in next provider                                            | `packages/next/src/client/I18nProvider.tsx:117-130` | W2c          | `packages/next/tests/next-hydration.test.tsx` — "Architectural boundary" describe block           | auto |

## P2 findings (14)

| #   | Finding                                                                                | File                                                 | Closing wave     | Artifact                                                                                                                 | Mode        |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 3   | Dim 2 P2 — useSubscribe identity stability (positive observation; minor cleanup)       | `packages/react/src/I18nProvider.tsx:24-32`          | W1.2             | `packages/react/tests/useSubscribe.test.tsx` — "returns stable subscribe identity"                                       | auto        |
| 4   | Dim 4 P2 — `useI18n()` returns fresh object identity per call                          | `packages/react/src/useI18n.ts:395-407`              | W4               | `packages/react/tests/effect-rerun.test.tsx` — full file + JSDoc in `useI18n.ts` `@remarks` block                        | auto+manual |
| 5   | Dim 4 P2 — `useI18n()` called per-`<T>` instance                                       | `packages/react/src/T.tsx:167-174`                   | W2b-ii           | Reduced via 2-context split — `<T>` no longer pays cache-fan-out subscription cost on Link/usePathname                   | n/a         |
| 6   | Dim 4 P2 — `boundMethods` identity stability                                           | `packages/react/src/useI18n.ts:374-393`              | W1.3             | `packages/react/src/useI18n.ts` — mapped-type Bound + Record write-only view                                             | manual      |
| 7   | Dim 5 P2 — SSR snapshot for `cacheRevision` server/client divergence risk              | `packages/react/src/I18nProvider.tsx:140-144`        | W2c              | `packages/next/tests/next-hydration.test.tsx` — "hydrateRoot emits no warnings"                                          | auto        |
| 8   | Dim 5 P2 — `ssrInitialLocale` flow on first client render                              | `packages/react/src/I18nProvider.tsx:133-137`        | W4               | `packages/react/tests/ssr.node.test.tsx` — "ssrInitialLocale overrides"                                                  | auto        |
| 9   | Dim 6 P2 — No `useTransition` / `useDeferredValue` helper for locale switching         | `packages/react/src/useI18n.ts:383`                  | Deferred Wave 5+ | `docs/adr/0003-suspense-integration.md` (B4 follow-up section)                                                           | manual      |
| 10  | Dim 6 P2 — Tearing surface in `<T>` reading `i18n.locale` via `createBoundTranslation` | `packages/react/src/T.tsx:177-179`, `useI18n.ts:363` | W2b-ii           | `packages/react/tests/useI18n.test.tsx` — "rebuilds t() reference on locale change" + ADR 0001                           | auto+manual |
| 11  | Dim 9 P2 — `as any` casts in `<T>`                                                     | `packages/react/src/T.tsx:179, 248`                  | W1.3             | `packages/react/src/T.tsx` — `as never` post-W1.3; greppable: `grep -n "as any" packages/react/src` returns zero matches | auto        |
| 12  | Dim 9 P2 — `React.memo(T)` collapses generics                                          | `packages/react/src/T.tsx:356`                       | Deferred Wave 5+ | `docs/adr/0004-T-generic-vs-memo.md`                                                                                     | manual      |
| 13  | Dim 10 P2 — `next/src/client.ts` ↔ `client/index.ts` duplicate re-exports              | both files                                           | W1.7             | `packages/next/src/client/` directory listing (only `I18nProvider.tsx` remains)                                          | auto        |
| 14  | Dim 10 P2 — `export type * from "@comvi/core"` re-export                               | `packages/react/src/index.ts:2-3`                    | W2b-ii           | (positive observation; no regression introduced; bundle still tree-shakeable)                                            | n/a         |
| 15  | Dim 11 P2 — No Suspense / `use()` integration                                          | `packages/react/src/I18nProvider.tsx` (no surface)   | Deferred Wave 5+ | `docs/adr/0003-suspense-integration.md`                                                                                  | manual      |
| 16  | Dim 12 P2 — `<T>` per-render Map/{} allocation when `components` undefined             | `packages/react/src/T.tsx:188-189`                   | W1.4             | `packages/react/tests/T.allocation.test.tsx`                                                                             | auto        |

## P3 findings (8)

| #   | Finding                                                               | File                                                     | Closing wave                        | Artifact                                                                                                        | Mode   |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| 17  | Dim 2 P3 — `getServerSnapshot` SSR coverage gap                       | `packages/react/src/I18nProvider.tsx:136, 143, 150, 155` | W4                                  | `packages/react/tests/ssr.node.test.tsx`                                                                        | auto   |
| 18  | Dim 3 P3 — `isFirstRenderRef.current = false` ref write during render | `packages/next/src/client/I18nProvider.tsx:127-128`      | W2c                                 | Subsumed by `useState(() => ...)` lazy init refactor; `isFirstRenderRef` removed from source                    | auto   |
| 19  | Dim 5 P3 — `useIsomorphicLayoutEffect` module-level shim              | `packages/next/src/client/I18nProvider.tsx:7`            | W2c                                 | (kept as-is; documented in audit as edge-case-only)                                                             | n/a    |
| 20  | Dim 6 P3 — StrictMode double-effect handling for `autoInit`           | `packages/react/src/I18nProvider.tsx:115-126`            | W2b-ii                              | `packages/react/src/I18nProvider.tsx` — comment block at the `useEffect` site documents the safety mechanism    | manual |
| 21  | Dim 7 P3 — `useSubscribe` events-array fragility                      | `packages/react/src/I18nProvider.tsx:24-32`              | W1.2                                | `packages/react/tests/useSubscribe.test.tsx` — "returns NEW subscribe identity when event list contents change" | auto   |
| 22  | Dim 7 P3 — `BIND_METHODS` bag uses `Record<string, unknown>`          | `packages/react/src/useI18n.ts:374-393`                  | W1.3                                | `packages/react/src/useI18n.ts` — mapped `Bound` type                                                           | auto   |
| 23  | Dim 8 P3 — `useI18n()` spread return JSDoc destructure warning        | `packages/react/src/useI18n.ts:359-408`                  | W4                                  | `packages/react/src/useI18n.ts` — `@remarks` block ("Identity warning")                                         | manual |
| 24  | Dim 8 P3 — `<T>` typed props permissive escape hatch                  | `packages/react/src/T.tsx:92-105`                        | (no action — intentional trade-off) | (positive observation; documented in audit)                                                                     | n/a    |

## ADR open questions (4) — all addressed

| OQ                                    | Decision                                       | Doc                                                                         |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| OQ-1 — `i18n.locale` source-of-truth  | Alternative 2 — context-routed locale (W2b-ii) | [`docs/adr/0001-i18n-locale-source.md`](adr/0001-i18n-locale-source.md)     |
| OQ-2 — Context split                  | 2-context (W2b-ii)                             | [`docs/adr/0002-context-split.md`](adr/0002-context-split.md)               |
| OQ-3 — Suspense / `use()` integration | DEFERRED to Wave 5+                            | [`docs/adr/0003-suspense-integration.md`](adr/0003-suspense-integration.md) |
| OQ-4 — `<T>` generic vs memo          | DEFERRED (measurement-gated, Wave 5+)          | [`docs/adr/0004-T-generic-vs-memo.md`](adr/0004-T-generic-vs-memo.md)       |

---

## Counts summary

- **P1 closed**: 2 / 2
- **P2 closed or deferred-with-ADR**: 14 / 14
- **P3 closed or noted**: 8 / 8
- **ADR open questions resolved**: 4 / 4

**Total: 24 / 24 audit findings addressed.**

## Plan PRs (commits on `chore/react-packages-audit`)

| Wave   | Commit          | Title                                                                               |
| ------ | --------------- | ----------------------------------------------------------------------------------- |
| W1     | `8aabad7`       | fix(react): useSubscribe rest-args + stable join-key deps                           |
| W1     | `1e5369d`       | refactor(react): tighten types — drop `as any`, mapped type for BIND_METHODS        |
| W1     | `e021721`       | perf(react): skip `<T>` Map/object allocation when components prop is undefined     |
| W1     | `cd1e0e1`       | fix(next): validate locale prop against routing.locales                             |
| W1     | `eebcbf9`       | chore(next): remove dead client/index.ts duplicate re-export                        |
| W2a    | `69e6160`       | feat(core)!: additive `locale` override on formatters                               |
| W2b-i  | `98cd10a`       | feat(react)!: drop React 16/17 peer + remove use-sync-external-store shim           |
| W2b-ii | `e74558c`       | feat(react,next)!: 2-context split + tRaw locale fix + useLocale/useIsLoading       |
| W2c    | `0dbebdd`       | feat(next)!: replace render-time mutation with useState lazy initializer            |
| W4     | _(this commit)_ | docs+test: ADRs, migration guide, verification matrix, SSR + effect-rerun harnesses |

Audit deliverables (initial branch commit `e1e2949`): `AUDIT-react-packages.md`, `packages/react/AUDIT-FINDINGS.md`, `packages/react/AUDIT-CONCURRENCY.md`, `packages/react/tests/render-counts.test.tsx`, `packages/react/tests/tearing.test.tsx`, `docs/plans/v0.3-fix-everything.md`.
