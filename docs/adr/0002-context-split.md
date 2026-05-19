# ADR 0002 — Context split: 2 contexts, not 1 or 3

**Status:** Accepted (v0.3 release)
**Date:** 2026-05-19
**Scope:** v0.3 React surface — Open Question OQ-2 (provider context partitioning).

## Decision

Replace the prior single `I18nContext` (carrying `{ i18n, locale, translationCache, isLoading, isInitializing }`) with two per-axis contexts:

- `LocaleContext: Context<string | null>` — narrow string axis.
- `I18nInstanceContext: Context<{ i18n, isLoading, isInitializing } | null>`.

`cacheRevision` is NO LONGER in any context's deps — it is subscribed by `useI18n()` consumers directly via `useSyncExternalStore`. Non-translation consumers (`<Link>`, `usePathname()`, `useLocalizedRouter()`) call `useLocale()` and read only the locale axis.

## Drivers

1. **Re-render economy (measurement-confirmed P1).** `render-counts.test.tsx` Subject B (Stub Link) and Subject C (Stub Pathname) measured **2 consumer-function-body invocations per namespace load** under the prior single-context design. Cause: `cacheRevision` was in the provider's `useMemo` deps; every namespace load produced a new context value that fanned out to every `useI18n()` consumer.
2. **Public API stability.** Critical that `useI18n()` return shape stays unchanged so consumer code doesn't migrate.
3. **Pragmatic simplicity.** Architect's iter-1 review recommended 2 contexts over 3 (no measurement justifying a separate `LoadingContext`).

## Affected sites

| File                                  | Line          | Change                                                                                                                                                               |
| ------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/react/src/I18nProvider.tsx` | 25-50 (now)   | Defines `LocaleContext` + `I18nInstanceContext`. `LocaleContext` default is `null` (sentinel for outside-provider detection without subscribing to InstanceContext). |
| `packages/react/src/I18nProvider.tsx` | 170-185 (now) | Provider renders nested `<I18nInstanceContext.Provider><LocaleContext.Provider>{children}</LocaleContext.Provider></I18nInstanceContext.Provider>`.                  |
| `packages/react/src/useI18n.ts`       | 365-380       | Reads `useI18nInstance()` + `useContext(LocaleContext)`; subscribes to cache events itself via `useSubscribe + useSyncExternalStore`.                                |
| `packages/next/src/routing/Link.tsx`  | 36            | Switched from `useI18n()` to `useLocale()`.                                                                                                                          |
| `packages/next/src/routing/hooks.ts`  | 31, 95        | `usePathname`, `useLocalizedRouter` switched to `useLocale()`.                                                                                                       |

## Alternatives considered

1. **Keep single context.** Rejected — leaves the measurement-confirmed P1 in place.
2. **2-context split (Locale + Instance, CHOSEN).**
3. **3-context split (Locale + Loading + Instance).** Architect's iter-1: "no measurement says isLoading change is a hot path." Adds Provider nesting + extra useContext per consumer for marginal benefit. Deferred — re-evaluate via render-counts harness if a future PR adds a high-frequency loading-flip workload.
4. **Per-consumer `useSyncExternalStore` selector pattern (zero contexts).** Cleaner in theory, but registers N listeners on the i18n event bus for N consumers — scales poorly for 50+ `<T>` instances. Context-based broadcast keeps listener count bounded (one subscription in the provider per axis).

## Why chosen (Alternative 2)

- Surgical fix for the measured bug — Subject B / Subject C consumer-function-body invocations drop from 2 → 0 per namespace load (verified in `render-counts.test.tsx` post-W2b-ii).
- Provider nesting cost is negligible (two `createContext` calls + two `.Provider` JSX nodes at module + render time).
- `useLocale()` becomes a true narrow selector — does NOT subscribe to InstanceContext, so it skips both cacheRevision AND isLoading axis changes. This is more aggressive than Architect's "1-context with cache subscription extracted" proposal and matches the plan's intent.
- `useI18n()` consumers continue to re-render on cache changes (correct — they read `translationCache`).
- `useI18nContext()` (deprecated) composes the legacy combined shape from the new sources — back-compat preserved through v0.3.

## Consequences

- **Public API additions**: `useLocale()`, `useIsLoading()` selector hooks exported from `@comvi/react`.
- **Public API deprecation**: `useI18nContext()` marked `@deprecated` — scheduled removal in v0.4.
- **Internal**: new `useI18nInstance()` (internal-only, exported with `@internal` JSDoc) for the provider-presence check used by `useI18n()`.
- **Hydration**: each context independently honors its `ssrInitial*` prop; verified by `ssr.node.test.ts`.
- **Bundle**: negligible — ~50 LOC of provider code; 1 module export added; one `Context` constructor invocation.

## Follow-ups

- Future Wave 5+ candidate: split `LoadingContext` out of `I18nInstanceContext` if measurement warrants (no demand signal yet).
- Future Wave 5+ candidate: `useTranslationCache()` selector for advanced consumers who only need cache freshness (e.g., devtools overlays).
- Migration guide documents `useLocale()` / `useIsLoading()` as preferred for new code.
