# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.1.0
