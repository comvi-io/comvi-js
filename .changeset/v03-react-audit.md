---
"@comvi/react": major
---

**Major release — React 18+ baseline, internal architecture refactor, additive selector hooks.**

### Added

- `useLocale()` hook — narrow locale-only subscription for components that don't need the full i18n bag (e.g. `<Link>`, routing utilities). Skips re-renders on namespace loads and loading-state changes.
- `useIsLoading()` hook — selector hook returning `{ isLoading, isInitializing }`. Skips re-renders on locale/translation changes.
- `useSetLocaleTransition()` hook — wraps `i18n.setLocaleAsync()` in `React.useTransition` so the previous UI stays interactive while the new locale loads. Returns `{ isPending, setLocale }`.
- `useFormatters()` hook — returns memoized `{ formatNumber, formatDate, formatCurrency, formatRelativeTime }` bound to `useLocale()` so formatter output auto-updates on locale change.

### Changed

- **Internal architecture:** provider now uses a 2-context split — `LocaleContext` (string axis) plus `I18nInstanceContext` (i18n + loading state). `cacheRevision` is no longer broadcast to all subscribers; `<T>` reads it directly via `useSyncExternalStore`. Public `useI18n()` API surface is unchanged.
- `t()` and `tRaw()` returned by `useI18n()` now rebuild on locale change (memo deps include `locale`). The React-tracked locale is injected into every bound translation call, closing a tearing surface where the bound function previously read the mutable `i18n.locale` at call time during `startTransition`-wrapped locale flips. Code that depended on stable `t` identity across locale flips needs to adapt; the new behavior is the intended fix.

### Deprecated

- `useI18nContext()` — works through this major but is scheduled for removal in the next major. Use `useI18n()` instead (same return shape, finer-grained subscriptions).

### Removed

- **React 16.8–17 peer support.** Requires `"react": "^18.0.0 || ^19.0.0"`. Users on React 17 should stay on `@comvi/react@^0.2.x`.
- `use-sync-external-store` shim dependency — replaced with the native `useSyncExternalStore` from React 18+.

### Fixed

- Non-translation consumers (`<Link>`, `usePathname()`, etc.) no longer re-render on every namespace load — measurement-confirmed via the new commit-counter harness.
- `useSubscribe()` event-list fragility — refactored to rest-args with a stable join-key dependency so dynamic event arrays no longer get a stale subscription.
- `<T>` type safety — replaced `as any` overload-bridge casts with `as never`; `BIND_METHODS` bag now uses a mapped type instead of `Record<string, unknown>`.
- `<T>` per-render allocation — no longer allocates `new Map()` + `{}` for tag handlers when the `components` prop is undefined (the common case).
- `<T>` `React.cloneElement` usage migrated to function composition / `React.createElement` (closes a React 19 soft-deprecation).

### Internal

- Peer dependency on `@comvi/core` bumped to the new minor.
- 92 unit tests + Profiler-based commit-counter harness + tearing repros (happy-dom) + Playwright e2e (in `test-apps/next`) verify the changes.

See CHANGELOG for the per-package upgrade checklist.
