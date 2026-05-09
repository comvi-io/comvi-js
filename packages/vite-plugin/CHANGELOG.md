# @comvi/vite-plugin

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- cba88bf: Fix broken documentation URLs in published READMEs. The `@comvi/cli` README pointed at `/docs/i18n/tooling/cli/` (404) — corrected to `/docs/cli/`. The `@comvi/vite-plugin` README's documentation links pointed at `/docs/i18n/tooling/vite-plugin/`, which doesn't exist at any URL — links removed until docs ship.

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.
