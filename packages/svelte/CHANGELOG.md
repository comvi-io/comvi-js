# @comvi/svelte

## 0.3.0

### Minor Changes

- 88b4941: Drop Svelte 4; migrate to Svelte 5 runes only.

  **BREAKING:** `@comvi/svelte` now requires Svelte 5 (`peerDependencies.svelte` is `^5.0.0`). Svelte 4 is no longer supported — stay on the previous minor if you need it.
  - `<T>` (`T.svelte`) is rewritten with runes (`$props()`, `$derived`/`$derived.by`, `{@render children()}`) so it compiles cleanly under both runes-default and global `runes: true` consumers, with no deprecation warnings. The previous legacy syntax (`export let`, `$:`, `$$props`, `$$slots`, `<slot>`) broke under `compilerOptions.runes: true`.
  - Explicit-prop forwarding semantics for `ns`/`locale`/`fallback`/`raw` are preserved via an internal sentinel (replacing the removed `$$props`), guarded by a characterization test.
  - `<T>` now injects safe defaults for `{@html}` output: `rel="noopener noreferrer"` on `<a target="_blank">` and an empty `alt=""` on `<img>` without one.
  - New exported type `TProps` for the `<T>` component props.
  - Docs/examples use Svelte 5 idiom (`onclick`/`onchange`, `$state`, `{@render}`); added an SSR (SvelteKit) section documenting the per-request instance pattern and `await i18n.init()`.
  - Build no longer runs a redundant `tsc --emitDeclarationOnly` pass (`svelte-package` emits complete declarations). `svelte-preprocess` is retained so published `.svelte` files stay TS-stripped. No change to published output. Added `publint` + `@arethetypeswrong/cli` checks; `attw` runs as an ESM-only contract check (ignoring `cjs-resolves-to-esm` and the svelte-package `internal-resolution-error`, both structural and bundler-irrelevant).
  - Stores (`useI18n`, `createLocaleStore`, etc.) are unchanged — `svelte/store` remains fully supported in Svelte 5.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

- 82dbcf1: Align package metadata.
  - Add `engines.node: ">=22"` to match the workspace root constraint.
  - Fix `repository.url` to include the required `git+` prefix.

- 4050429: CORE reactivity fixes from the v0.3 review:
  - **core (L3):** `addTranslations()` no longer emits `configChanged` for runtime-added translations — it relies on the `namespaceLoaded` event (and the cache-revision bump) that `_nsAddTranslations` already fires, removing a redundant double re-render. **Behavior note:** if you have an external `on("configChanged", …)` listener that was reacting to `addTranslations`, switch it to `on("namespaceLoaded", …)`. `configChanged` is still emitted for fallback-locale and namespace-activation changes. An empty `addTranslations({})` is now a true no-op.
  - **core (L1):** the `Intl` formatter caches (number/date/relative-time) are now bounded (FIFO eviction at 1000 entries), mirroring the template cache. Prevents unbounded growth for apps formatting many distinct `(locale, options)` combinations via the per-call `locale` override.
  - **solid & svelte (M4):** the cache-revision signal/store now uses a single monotonic counter instead of summing two independent counters, which could collide non-monotonically and drop a re-render (e.g. a `configChanged` that didn't change the translation cache).
  - **vue (M1):** added imperative, non-reactive `hasTranslationNow(key, opts?)` and `hasLocaleNow(locale, namespace?)` returning plain booleans — for use in loops/handlers where the reactive `hasTranslation()`/`hasLocale()` (which allocate a `computed()` per call) would leak outside an effect scope. Re-exposed through `@comvi/nuxt`'s `useI18n()`.

- c705faf: Polish from the v0.3 review (no behavior change to existing valid usage):
  - **cli:** warn (and ignore) when a `.comvirc.json` carries the deprecated `languages` field — it was renamed to `locales`. Mirrors the existing `defaultNsName` deprecation warning.
  - **svelte:** tighten `TProps.params` from `Record<string, unknown>` to `TranslationParams`, matching `@comvi/solid` and what `tRaw` actually accepts.
  - **react:** document the `useSetLocaleTransition()` and `useFormatters()` hooks in the README.

- Updated dependencies [1feaed4]
- Updated dependencies [e1f4ccb]
- Updated dependencies [6e5370c]
- Updated dependencies [88ae52a]
- Updated dependencies [4050429]
- Updated dependencies [872680e]
  - @comvi/core@0.3.0

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- 46cdfb4: Strip TypeScript types from published `.svelte` files via `svelte-preprocess`. Previously `dist/T.svelte` shipped with raw `<script lang="ts">` (type annotations and `import type`), which broke consumers and bundle analyzers without a TS-aware Svelte preprocessor (e.g. bundlephobia, older webpack setups).
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
