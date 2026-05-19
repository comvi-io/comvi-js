# @comvi/react

## 0.3.0

### Added

- `useLocale()` hook — narrow locale-only subscription for components that don't need the full i18n bag (e.g., `<Link>`, routing utilities). Skips re-renders on namespace loads and loading-state changes (W2b-ii, e74558c).
- `useIsLoading()` hook — selector hook for `{ isLoading, isInitializing }` slice, skipping re-renders on locale/translation changes (W2b-ii, e74558c).

### Changed

- **Internal architecture:** 2-context split for improved render economy.
  - `LocaleContext` (string) — used by `<Link>`, `usePathname()`, `useLocale()`
  - `I18nInstanceContext` ({ i18n, isLoading, isInitializing }) — instance access and loading UX
  - `cacheRevision` no longer broadcast to all subscribers; `<T>` reads it via direct `useSyncExternalStore` subscription (W2b-ii, e74558c)
- `t()` and `tRaw()` identity now **changes on locale flip** (intentional; closes tearing surface, ADR 0001). Memoized on `[i18n, ns, locale]` instead of `[i18n, ns]` to ensure React-tracked locale is injected into every call. See [migration guide](../migration/v0.2-to-v0.3.md) section 3 (W2b-ii, e74558c).
- `useI18n()` return: `t` and `tRaw` functions rebuild on locale change. Effect deps that relied on stable function identity will re-run; this is the intended behavior to prevent tearing during `startTransition`-wrapped locale switches.

### Deprecated

- `useI18nContext()` — still works through v0.3 but will be removed in v0.4. Use `useI18n()` instead (same return shape, finer-grained subscriptions).

### Removed

- React 16.8 and 17 peer support — `@comvi/react@0.3.x` requires `"react": "^18.0.0 || ^19.0.0"` (W2b-i, 98cd10a).
- `use-sync-external-store` shim dependency — replaced with native `useSyncExternalStore` from React 18+ (W2b-i, 98cd10a).

### Fixed

- `cacheRevision` fan-out to non-translation consumers — `<Link>`, `usePathname()`, and other locale-only components no longer re-render on every namespace load (W2b-ii, e74558c; closes Dim 4 P1).
- `useSubscribe()` rest-args and stable dependency key — dynamic event arrays now generate a consistent dependency string to prevent unnecessary re-subscriptions (W1.2, 8aabad7).
- `<T>` type safety — removed `as any` casts in favor of `as never` and mapped-type constraints (W1.3, 1e5369d).
- `<T>` allocation when `components` prop is undefined — skips ephemeral Map/object allocations in render path (W1.4, e021721).

### Internal

- Peer dependency on `@comvi/core` bumped to `^0.3.0` (additive API).

---

See the [migration guide](../migration/v0.2-to-v0.3.md) for breaking change details and upgrade checklist. This is a **major release**.

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
