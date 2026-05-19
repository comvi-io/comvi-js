# ADR 0001 — `i18n.locale` source-of-truth in the React surface

**Status:** Accepted (v0.3 release)
**Date:** 2026-05-19
**Scope:** v0.3 React surface — Open Question OQ-1 (translation-layer locale source-of-truth).

## Decision

Adopt **Alternative 2 — context-routed locale**. `useI18n()` reads `locale` from `LocaleContext` (a useSyncExternalStore-backed source) and INJECTS it into every `tRaw` call as `{ locale, ...params }`. Explicit user-supplied `locale` overrides the tracked value via spread order.

`i18n.locale` (the instance field) remains as a default for non-React callers (Vue, Svelte, Solid, Nuxt today; plain-JS users) but is NO LONGER the source of truth for translations rendered inside `<I18nProvider>`.

## Drivers (ordered per Principle 5: correctness > perf > DX)

1. **Correctness — concurrent rendering.** `createBoundTranslation(i18n, ns)` previously captured `i18n` and read `i18n.locale` at call time. Under a `startTransition` that mutates the instance locale before the new tree commits, in-flight `<T>` renders could observe the new locale even though they belong to the old tree. The harness `tearing.test.tsx` could not demonstrate this in happy-dom (atomic commits) but the source path was real.
2. **Hydration coupling.** Next's render-time `i18n.locale = locale` mutation was load-bearing because `t()` read `i18n.locale` synchronously. Routing the locale through React context decouples the two — the Next provider can move the mutation into a `useState` lazy initializer (W2c) without breaking the inner React provider's locale read.
3. **Perf (downstream).** Indirect: enables W2b-ii's 2-context split because cacheRevision can be lifted out of the per-axis Locale context.
4. **DX.** Identity of `t`/`tRaw` now churns on locale change — strictly more correct for `useEffect` consumers (which now re-run on locale change as expected) but requires consumers who memoized assuming stability to revisit. See migration guide.

## Affected sites

| File                                        | Line               | Change                                                                                                 |
| ------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/react/src/useI18n.ts`             | 363 (now ~389)     | `tRaw` wraps `createBoundTranslation` and injects `locale` via closure; useMemo deps include `locale`. |
| `packages/react/src/T.tsx`                  | 177-179            | `translate = tRaw ?? fallback` — unchanged. `tRaw` carries the locale fix transparently.               |
| `packages/next/src/client/I18nProvider.tsx` | 117-130            | Render-time mutation pattern replaced by `useState(() => syncLocaleSafely(...))` lazy init (W2c).      |
| `packages/react/src/I18nProvider.tsx`       | 133-137 (now ~178) | `useSyncExternalStore` populates `LocaleContext`; consumers read context, not `i18n.locale`.           |

## Alternatives considered

1. **Keep bound capture, memoize per-locale.** Trivial change. Rejected — tearing surface unchanged; `t()` still reads `i18n.locale` internally; doesn't unblock W2c.
2. **Context-provided unbound `t` + locale selector (CHOSEN).** Architectural; preserves public `useI18n()` API; closes tearing surface; unblocks W2c.
3. **`useSyncExternalStore` selector returning `{ t, locale }` tuple.** Snapshot purity rule violated (returns new object every call); requires custom equality. Rejected.
4. **Defer pending React 19 `use()` adoption.** Doesn't address synchronous tearing surface in current React; pushes the decision out without resolving. Rejected.

## Why chosen (Alternative 2)

- Closes the tearing surface STRUCTURALLY rather than by relying on harness-indeterminate behavior. Even when happy-dom can't observe mid-commit tearing, the source path is provably safe.
- Public `useI18n()` API surface unchanged. Internal-only refactor at the React boundary.
- Unlocks W2c (removal of render-time mutation in Next provider) — together they resolve Dim 3 P1, Dim 5 P2, Dim 6 P2.
- Compatible with future migration to `useSyncExternalStore`-only or `use()`-based async patterns.

## Consequences

- **Identity churn**: `t`/`tRaw` return new function identity on locale change. Tests that asserted stable identity across locale flips now assert the inverse. Documented in migration guide.
- **Hydration**: `LocaleContext`'s server snapshot uses `ssrInitialLocale ?? i18n.locale`. The Next provider sets the instance locale before children render via the lazy initializer, so descendant translations read the right locale on first paint — verified by `next-hydration.test.tsx`.
- **Other framework bindings unaffected**: Vue / Svelte / Solid / Nuxt continue to use `createBoundTranslation(i18n, ns)` directly. Core's `t/tRaw` already honors `params.locale` (verified at `packages/core/src/core/i18n.ts:799`).
- **Formatter follow-up**: W2a added optional `locale` parameter to `formatNumber/Date/Currency/RelativeTime` so a future `useFormatters()` hook in `@comvi/react` can thread the React-tracked locale. Not built in W2b-ii; tracked as Wave 5 follow-up.

## Follow-ups

- Build `useFormatters()` selector hook bound to `useLocale()` (Wave 5 — currently no measurement of demand).
- Consider exposing `t({ locale })` overload at the public `useI18n()` surface for one-off translations against a different locale. Currently possible via `params.locale` but not documented prominently.
- Monitor for any consumer who depended on the previous stable `t` identity. Migration guide covers the destructure-locale pattern.
