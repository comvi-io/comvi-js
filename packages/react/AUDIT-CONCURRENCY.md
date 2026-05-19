# Concurrency Audit — Findings

Companion to `packages/react/AUDIT-FINDINGS.md`. This pass attempted four
concurrency repros named by the parent audit, against the actual branch
`chore/react-packages-audit`. Tests live at
`packages/react/tests/tearing.test.tsx`.

Environment: happy-dom, React 19.2.4, Vitest 4.1.2, `--max-old-space-size=4096`.

## Counts

- P0 findings: 0
- Confirmed-tearing bugs: 0
- Indeterminate (harness-limited): 1 (Repro 1)
- Confirmed-sound under harness: 2 (Repro 2, Repro 3)
- Architectural-only (no external attack surface): 1 (Repro 4)

## Repro 1 — startTransition + locale flip

- **Status:** indeterminate (harness limitation)
- **Tests:**
  - `packages/react/tests/tearing.test.tsx` — `it("two <T> consumers commit pair-consistent locale under startTransition (StrictMode OFF)", ...)`
  - `... (StrictMode ON)`
- **Evidence type:** architectural-only (pair-consistency at final commit verified; mid-transition state not observable)
- **Affects audit finding:** [AUDIT-FINDINGS.md Dimension 3 P1 — `next/client/I18nProvider.tsx:115-130`] / [Dimension 6 P2 — `<T>` reading `i18n.locale` via `tRaw`]
- **Verdict:** confirm (no upgrade) — the audit's "architectural concern only, not P1+" rating holds.

**What the test shows.** Two `<T>`-like probes (`ProbeA`, `ProbeB`)
subscribe via `useI18n()` and render `t("greeting")`. A
`React.startTransition(() => fake.setLocaleAsync("fr"))` is dispatched.
Final committed DOM shows both probes in French ("Bonjour"), with the
Profiler reporting a bounded number of commits (≤3, observed 1-2 in
practice).

**Harness limitation.** happy-dom commits trees atomically into the DOM.
`getByTestId` only reads committed snapshots; we cannot observe a
mid-transition state where one sibling has been processed and the other
has not. The audit-described hazard — `tRaw` reading the mutable global
`i18n.locale` while a transition is in flight — would require concurrent
rendering with externally-paced work that the harness does not expose.

**Why the architectural concern still holds (code-read):**

- `packages/react/src/I18nProvider.tsx:133-137` reads `i18n.locale` via
  `useSyncExternalStore`. The snapshot value flows into the context
  `value` object at `:162-171` and out to consumers.
- But `packages/react/src/T.tsx:248` invokes `translate(keyString as any, transportParams)`
  where `translate = tRaw ?? ...`. `tRaw` is `createBoundTranslation(i18n, ns)`
  from `packages/react/src/useI18n.ts:363`, which reads `i18n.locale`
  internally at call time, NOT the React-store value.
- If a transition pre-mutates `i18n.locale` before a high-priority render
  finishes, the high-priority render's `<T>` calls observe the new locale
  while React still believes the tree is rendering against the old state.
- This is the exact pattern flagged by Dimension 6 P2 in the parent
  audit. The harness cannot demonstrate it, but the source path is real.

**Recommended follow-up.** ADR per Open Question #1 in
`AUDIT-FINDINGS.md`. Wire `<T>` to read locale from the `useI18n()`
context value rather than via `tRaw` bound to the instance.

## Repro 2 — Aborted transition leakage

- **Status:** confirmed-sound (under harness)
- **Test:** `packages/react/tests/tearing.test.tsx` — `it("two interleaved startTransition setLocale calls — final committed locale is the latest", ...)`
- **Evidence type:** repro (gated `setLocaleAsync` to control interleaving)
- **Affects audit finding:** [AUDIT-FINDINGS.md Dimension 3 P1] (concurrent-render hazard scenario at line 159)
- **Verdict:** downgrade applicability — the "first transition leaks past the second" failure mode does NOT manifest in this harness when the two calls resolve in order.

**What the test shows.** Two transitions are scheduled in sequence:
`startTransition(() => setLocaleAsync("fr"))`, then
`startTransition(() => setLocaleAsync("de"))`. The first call is gated
behind a deferred promise; we resolve fr then de. Final committed state
is `i18n.locale === "de"` and the probe shows "Hallo". The "fr" value
does not leak.

**Caveat — what this does NOT cover.** The audit's hazard at
`AUDIT-FINDINGS.md:159` describes a different ordering: React aborts the
FIRST transition mid-flight (e.g. because a higher-priority render
intervened) AFTER `i18n.locale = "fr"` already happened in a render-time
mutation. Our test exercises the application-level call sequence, not
React's internal abort path. happy-dom + a synchronous `act()` queue
does not let us force React to abort a render mid-commit.

**Why the architectural concern still holds (code-read):**

- `next/client/I18nProvider.tsx:117-119` mutates `i18n.locale = locale`
  during render when `isFirstRenderRef.current` is true.
- React 19 may discard a render before commit under concurrent features.
  The mutation persists; the abort discards the React tree. Now
  `i18n.locale` is "ahead" of the committed React state. Translation
  reads from `<T>` via `tRaw` observe the leaked value.

**Recommended follow-up.** Same as Repro 1 — move locale-sync into a
`useState(() => ...)` lazy initializer or a `useLayoutEffect`, per the
parent audit's Option B at lines 146-156.

## Repro 3 — Next-provider render-time mutation idempotency

- **Status:** confirmed-sound
- **Tests:**
  - `packages/react/tests/tearing.test.tsx` — three `it()` blocks under
    `describe("Repro 3 — Next provider render-time mutation idempotency", ...)`
- **Evidence type:** repro (call-count assertion on `fake.addTranslations`)
- **Affects audit finding:** [AUDIT-FINDINGS.md Dimension 3 P1 — StrictMode double-invocation behavior]
- **Verdict:** confirm — the ref-guard at `next/client/I18nProvider.tsx:122` holds across StrictMode double-mount, locale flips, and back-flips.

**What the tests show:**

1. **StrictMode OFF**, three consecutive renders with a stable `messages`
   prop reference (`en → fr → en`). `fake.addTranslations` is called
   exactly **once**.
2. **StrictMode ON**, mount + locale flip with stable `messages` ref.
   `fake.addTranslations` is called exactly **once** despite
   `useIsomorphicLayoutEffect` firing twice under StrictMode — the
   `messages !== lastAddedMessagesRef.current` guard at
   `next/client/I18nProvider.tsx:122` absorbs the duplicate.
3. **New `messages` identity** ⇒ exactly **+1** call. By-identity
   semantics work as documented.

**Significant.** The audit flagged "StrictMode double-invocation" as a
fragility (`AUDIT-FINDINGS.md:140`). The harness confirms the current
code is **idempotent under StrictMode** with stable refs. The fragility
the audit calls out — that the `isFirstRenderRef.current = false` write
is the load-bearing piece — is real (a misordering or removal of that
line would break the guarantee) but the code as written is correct.

## Repro 4 — useSubscribe events-array fragility

- **Status:** confirmed-fragile (architectural-only; no external surface)
- **Test:** `packages/react/tests/tearing.test.tsx` — `it("re-subscribe is gated on i18n identity only — events list changes are ignored (architectural-only)", ...)`
- **Evidence type:** architectural-only (mirror-component repro — no public path)
- **Affects audit finding:** [AUDIT-FINDINGS.md Dimension 7 P3 — `react/I18nProvider.tsx:24-32`]
- **Verdict:** confirm at P3 — the audit's existing severity (P3, internal-only) is correct.

**What the test shows.** A mirror component `useSubscribeLike(i18n, events)`
duplicates the production shape at `src/I18nProvider.tsx:24-32`. With
deps `[i18n]` only, re-rendering the component with a new `events` array
does NOT change the `useCallback` identity. A `useEffect(() => ..., [sub])`
that creates a subscription only fires on mount; the new events list is
silently ignored.

**External attack surface.** None. The three call sites in
`src/I18nProvider.tsx:129-131` each pass a static literal:

- `["localeChanged", "initialized"]`
- `["namespaceLoaded", "initialized", "translationsCleared"]`
- `["loadingStateChanged", "initialized"]`

There is no public hook or API that exposes `useSubscribe` to user code.
This means the fragility is purely internal — a future refactor that
passes a dynamic events list would introduce a real bug, but today the
external behavior is correct.

**Recommended follow-up.** Apply the fix from `AUDIT-FINDINGS.md:343-358`
(`useSubscribe(i18n, ...events)` rest-args + `events.join("|")` key) or
add an ESLint custom rule to catch the pattern.

## Synthesis

How these results change the P1 set in `AUDIT-FINDINGS.md`:

| Audit Finding                                          | Concurrency-pass evidence                                                                                      | New severity                                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dimension 3 P1 (render-time mutation in Next provider) | Repro 1 indeterminate, Repro 3 confirmed-sound under current code; harness can't observe the documented hazard | **Hold at P1** — the source-code path is real, but no harness-observable bug today. Treat as ADR-level (OQ-1 in parent audit). |
| Dimension 6 P2 (`<T>` tearing under transitions)       | Repro 1 indeterminate                                                                                          | **Hold at P2** — architectural concern only; needs RDT/Fiber tracing or a Next-E2E to upgrade.                                 |
| Dimension 7 P3 (`useSubscribe` fragility)              | Repro 4 confirms shape, no external surface                                                                    | **Hold at P3** — confirmed-fragile-but-internal.                                                                               |
| Dimension 14 P2 (no concurrent-rendering test)         | Now partially covered by `tearing.test.tsx` (4 tests, 7 cases)                                                 | **Downgrade to P3** — coverage exists, but full mid-commit observability requires a non-happy-dom harness.                     |

**New findings (this pass):**

- (no P0/P1 added)
- **P3 (test-only)** — happy-dom commits atomically; cross-commit DOM
  observability is impossible. Any future tearing-class test should
  switch to a renderer with mid-commit hooks (e.g. a React test renderer
  with custom `onCommitFiberRoot` listener) or move to a Next-E2E with
  Playwright. See `tearing.test.tsx` harness-limitation comments.

**Coverage gaps that remain:**

- True mid-transition DOM observability (Repro 1 and Repro 2 architectural
  hazards). Requires an instrumented renderer or browser-based E2E.
- Memory pressure under sustained `startTransition` churn. Not exercised.
- StrictMode in Repro 4 (we ran StrictMode-OFF for the mirror component;
  the production code is exercised under StrictMode elsewhere in
  `render-counts.test.tsx`).
- The `next/client/I18nProvider`'s `useIsomorphicLayoutEffect` path under
  StrictMode double-invocation (mounted by Repro 3, but call-count only
  — not error/warning assertion).

**Production-source mutations:** none. Read-only audit per the parent
task's boundaries.
