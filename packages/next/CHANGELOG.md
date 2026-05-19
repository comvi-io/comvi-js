# @comvi/next

## 0.3.0

### Added

- Locale validation against `routing.locales` in `<I18nProvider>` — invalid locale props now trigger `i18n.reportError` (W1.6, cd1e0e1).

### Changed

- `<I18nProvider>` internals: locale sync moved from render body to `useState` lazy initializer. Instance mutations (`i18n.locale = locale`, `i18n.addTranslations(...)`) now run once at initialization instead of every render, preserving idempotency while unblocking concurrent rendering (W2c, 0dbebdd; closes Dim 3 P1).
- `<Link>`, `usePathname()`, and `useLocalizedRouter()` now use `useLocale()` under the hood instead of full `useI18n()` subscription — non-translation routing consumers no longer re-render on namespace loads (W2b-ii, e74558c).

### Removed

- React 16.8 and 17 peer support via dependency bump — `@comvi/next@0.3.x` requires `@comvi/react@^0.3.0`, which requires React 18+ (W2b-i inherited from react).
- Duplicate `src/client/index.ts` re-export file — consolidated to `src/client/I18nProvider.tsx` as single source of truth (W1.7, eebcbf9).

### Internal

- Peer dependencies bumped:
  - `@comvi/core` to `^0.3.0` (additive API)
  - `@comvi/react` to `^0.3.0` (major release)

---

See the [migration guide](../migration/v0.2-to-v0.3.md) for breaking change details and upgrade checklist. This is a **major release**.

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0
  - @comvi/react@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1
  - @comvi/react@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
  - @comvi/react@1.0.0
