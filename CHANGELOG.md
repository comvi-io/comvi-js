# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-09

Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features; the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Added

- **@comvi/cli** — Auto-load `.env` for all commands.
- **@comvi/cli** — Support `namespaces` and `locales` filters in `.comvirc.json` for scoped `pull`/`push`/`generate` operations.

### Changed

- **@comvi/cli** — Rename `languages` → `locales` in config and the CLI flag for consistency with the rest of the API.
- **@comvi/cli** — Persist `namespaces`/`locales` in `ConfigLoader.create`; tighten `.env`-related wording.
- **@comvi/cli** — Drop the unused `@comvi/core` runtime dependency.
- All `@comvi/*` packages bumped to `0.2.0` in lockstep — the framework bindings (`vue`, `react`, `solid`, `svelte`, `next`, `nuxt`), plugins (`plugin-fetch-loader`, `plugin-locale-detector`, `plugin-in-context-editor`), `core`, `vite-plugin`, and `cli` now share one version baseline so users see a single version number per install.

### Fixed

- **@comvi/svelte** — Strip TypeScript from the `.svelte` build output so consumers don't need a TS-aware Svelte tooling chain.

### Docs

- README: swap bundlejs badges for bundlephobia; drop dead `RELEASING` link; fix CLI doc URL; drop dead `vite-plugin` doc links.

## [0.1.1] - 2026-05-04

### Changed

- All `@comvi/*` packages republished from CI via npm Trusted Publishing (OIDC). Every tarball now ships with a signed provenance attestation linking it back to the `comvi-io/comvi-js` `release.yml` workflow run that built it.

## [0.1.0] - 2025-01-30

### Initial Release

A lightweight, type-safe internationalization library with framework-agnostic core and bindings for Vue, React, Svelte, SolidJS, Next.js, and Nuxt.

### Core Features

#### Multi-Framework Support

- **@comvi/core** - Framework-agnostic core package (25.08 kB, 8.07 kB gzipped)
- **@comvi/vue** - Vue 3 bindings with full reactivity support
- **@comvi/react** - React 18+ bindings with hooks
- **@comvi/solid** - SolidJS bindings with reactive primitives
- **@comvi/svelte** - Svelte 4/5 bindings with stores
- **@comvi/next** - Next.js 14+ App Router integration with SSR
- **@comvi/nuxt** - Nuxt 3 module with auto-imports

#### Plugin System

- Extensible architecture with plugin support
- **@comvi/plugin-fetch-loader** - HTTP translation loading with timeout, fallback, and request deduplication
- **@comvi/plugin-locale-detector** - Auto-detect user locale (browser, localStorage, cookies)
- **@comvi/plugin-in-context-editor** - Visual inline translation editing
- **@comvi/cli** - CLI for type generation and translation sync

#### Translation Features

- Nested translations with dot notation (e.g., `welcome.message`)
- Parameter interpolation: `"Hello, {name}!"`
- ICU MessageFormat pluralization: `{count, plural, one {# item} other {# items}}`
- Namespace organization for code-splitting
- Fallback language chains
- Post-processor support for custom transformations
- Missing key and load error callbacks

#### Developer Experience

- TypeScript-first with full type safety
- Reactive state management per framework
- Progressive loading pattern (show UI immediately, load translations in background)
- Guaranteed-ready pattern (await translations before app start)

[0.2.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.2.0
[0.1.1]: https://github.com/comvi-io/comvi-js/releases/tag/v0.1.1
[0.1.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.1.0
