# @comvi/svelte

## 1.0.0

### Patch Changes

- 46cdfb4: Strip TypeScript types from published `.svelte` files via `svelte-preprocess`. Previously `dist/T.svelte` shipped with raw `<script lang="ts">` (type annotations and `import type`), which broke consumers and bundle analyzers without a TS-aware Svelte preprocessor (e.g. bundlephobia, older webpack setups).
  - @comvi/core@1.0.0

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
