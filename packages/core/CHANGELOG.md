# @comvi/core

## 0.3.0

### Added

- Optional `locale` parameter to `formatNumber()`, `formatDate()`, `formatCurrency()`, and `formatRelativeTime()` to override the instance locale on a per-call basis (W2a, 69e6160). Existing call sites continue to work without the parameter.

### Changed

- `createBoundTranslation()` now accepts an optional `getLocale` parameter for custom locale resolution in framework bindings.

---

See the [migration guide](../migration/v0.2-to-v0.3.md) for details. This is a **minor release** — all changes are additive.

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.
