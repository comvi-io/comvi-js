# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1]

Coordinated `0.4.1` release across all publishable `@comvi/*` packages. Detailed package-level notes and migration guidance are available in the linked GitHub Release.

### Patch Changes

- **@comvi/core** — Support underscores in interpolation tag names, including paired and self-closing `snake_case` tags in ICU message branches.

## [0.4.0] - 2026-07-13

Coordinated `0.4.0` release across all publishable `@comvi/*` packages. Detailed package-level notes and migration guidance are available in the linked GitHub Release.

### Minor Changes

- **@comvi/core** — **Breaking:** formatter methods and the `dir` getter moved from `I18n` to standalone tree-shakeable exports, reducing consumer bundle size.
- **@comvi/core** — ICU apostrophe handling now follows DOUBLE_OPTIONAL behavior, including context-aware `#` parsing and corrected template caching.
- **@comvi/core, @comvi/next, @comvi/nuxt, @comvi/react, @comvi/solid, @comvi/svelte, @comvi/vue** — Added one `defaultParams` / `setDefaultParams` API with idiomatic reactivity across every framework binding.
- **@comvi/nuxt** — Added configurable locale detection from query parameters and query-aware locale switching.
- **@comvi/plugin-fetch-loader** — Added explicit CDN namespace layouts, including folder-only storage and a root namespace different from the consumer `defaultNs`.
- **@comvi/plugin-locale-detector** — Added `cacheFirst` so applications can choose whether cached locale or configured detector order has priority.
- **@comvi/plugin-in-context-editor** — Added passive, privacy-conscious UI context collection for active editor sessions.

### Patch Changes

- **@comvi/core** — Hardened translation input handling, initialization state, concurrent locale changes, stale namespace loads, and fallback behavior.
- **@comvi/core** — Fixed nested plural `#` substitution so each token binds to its nearest plural count.
- **@comvi/cli** — Added `pull --dry-run`, real version reporting, atomic secret/file writes, bounded retries, timeout cleanup, and serialized watch updates.
- **@comvi/plugin-fetch-loader** — Hardened request cancellation, SSR cache propagation, response validation, and URL-specific diagnostics.
- **@comvi/nuxt, @comvi/plugin-locale-detector, @comvi/vue** — Fixed Nuxt dev detection, reactive Vue formatters, and secure `SameSite=None` cookies.
- **@comvi/plugin-in-context-editor** — Reduced consumer bundle cost through lazy UI loading and hardened editor storage/error handling.

## [0.3.0] - 2026-06-02

Coordinated `0.3.0` release across all publishable `@comvi/*` packages. This release modernized the package format and framework baselines while keeping the CDN entry points available.

### Minor Changes

- **All packages** — **Breaking:** npm packages are ESM-only; CommonJS entry points and duplicate `.d.cts` declarations were removed.
- **@comvi/core** — Added a minified UMD/CDN build, bounded shared caches, formatter locale overrides, and runtime performance improvements.
- **@comvi/react, @comvi/next** — Raised the baseline to React 18 and added selector hooks, tracked formatters, safer provider initialization, and locale validation.
- **@comvi/vue, @comvi/nuxt** — Added reactive locale/namespace helpers and made unprefixed Nuxt routes authoritative for the default locale in `as-needed` mode.
- **@comvi/svelte** — **Breaking:** moved to Svelte 5 runes and dropped Svelte 4 support.
- **@comvi/solid** — Improved provider error handling, lazy fallbacks, component ownership, pinned-locale tracking, and client-rendering documentation.
- **@comvi/cli, @comvi/vite-plugin** — Changed the default translation layout so the TMS default namespace maps to root locale files.

### Patch Changes

- **Runtime packages** — Broadened Node.js support to Node 18+ while keeping build-time CLI/Vite tooling on Node 22+.
- **@comvi/core, @comvi/react, @comvi/solid, @comvi/svelte, @comvi/vue** — Fixed subscription races, redundant renders, cache growth, and reactive revision collisions.
- **@comvi/solid** — Restored complete published TypeScript declarations.
- **@comvi/nuxt** — Hardened setup failures, fallback resolution, runtime dependencies, metadata, and patched transitive dependencies.

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

[0.4.1]: https://github.com/comvi-io/comvi-js/releases/tag/v0.4.1
[0.4.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.4.0
[0.3.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.3.0
[0.2.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.2.0
[0.1.1]: https://github.com/comvi-io/comvi-js/releases/tag/v0.1.1
[0.1.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.1.0
