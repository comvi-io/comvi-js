# @comvi/vue

## 0.4.0

### Minor Changes

- aaea018: Instance-level `defaultParams`:
  - `createI18n({ defaultParams: { formality: "formal" } })` merges the given params under every `t()`/`tRaw()` call; call-level params override defaults key by key (shallow merge).
  - `defaultParams` contains non-nullish interpolation values only. Per-call controls (`locale`, `ns`, `fallback`, `raw`) and `null`/`undefined` values are rejected in types and at runtime.
  - `setDefaultParams(...)` replaces the defaults at runtime and emits `configChanged` (source: `"defaultParams"`), so framework bindings re-render automatically. Defaults guaranteed by the constructor cannot later be removed or changed outside the generated message schema; instances created without defaults may still set or clear dynamic defaults. Explicitly optional default properties are rejected because they cannot represent constructor guarantees.
  - Params objects are copied shallowly on write and read: top-level additions/reassignments do not mutate instance state, while nested arrays, VNodes, callbacks, and props retain identity and should be treated as immutable.
  - Typed core/Vue instances make constructor-guaranteed, type-compatible message params optional at call sites. Framework hooks remain conservative by default and accept an explicit defaults type when the provider scope guarantees it.
  - An ICU `select` whose param is missing still falls back to its `other` branch, which keeps missing-default setups rendering the informal/default text instead of breaking.

  All framework facades expose the same `defaultParams` / `setDefaultParams` names with idiomatic reactivity: Vue/Nuxt `ComputedRef`, React render snapshot, Solid accessor, and Svelte readable store. Typed translation calls carry the explicit defaults type in every binding, including Svelte stores. `createNextI18n()` and Nuxt client/request instances now forward constructor defaults.

### Patch Changes

- 641245b: Fix three binding bugs found in the fleet-wide package audit:
  - **nuxt**: replaced the Nuxt 2-era `process.dev` with `import.meta.dev` in `useSwitchLocalePath` so the invalid-locale dev warning actually fires.
  - **vue**: `formatNumber`/`formatDate`/`formatCurrency`/`formatRelativeTime` read the non-reactive core locale, so template usages did not re-render after a locale switch (React binding already behaved correctly). They now default to the reactive locale ref.
  - **plugin-locale-detector**: cookies written with `sameSite: "none"` but no `secure` flag are rejected by modern browsers; `Secure` is now forced for `SameSite=None`.

- bec9ad6: Bundle-size pass for @comvi/core (−17% min, −7% gzip for consumers; more when formatters are unused).

  **BREAKING (@comvi/core):** `formatNumber` / `formatDate` / `formatCurrency` / `formatRelativeTime` and the `dir` getter moved off the `I18n` class to standalone tree-shakeable exports. Migrate `i18n.formatNumber(v, opts)` → `formatNumber(i18n, v, opts)` and `i18n.dir` → `getTextDirection(i18n.locale)`. Framework bindings (`useI18n`, `useFormatters`) keep their existing API — no changes needed in components.

  Other changes:
  - Internal class members now use native `#private`, so app bundlers mangle them (CDN UMD 25.5 → 21.2 kB).
  - `TranslationCache.getInternalMap()` returns the snapshot typed as `ReadonlyMap` without a runtime wrapper.
  - New `development` export condition ships readable error messages in dev; the production artifact keeps compact `E_*` codes.

- Updated dependencies [bec9ad6]
- Updated dependencies [a5c80b8]
- Updated dependencies [6463199]
- Updated dependencies [38ce169]
- Updated dependencies [aaea018]
  - @comvi/core@0.4.0

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- c473f32: Add the Vue 0.3 reactive API surface for loaded locales, active namespaces, default namespace, reactive hasTranslation/hasLocale helpers, and config-change-aware translation recomputation. This intentionally changes pre-1.0 composable return shapes; consumers should read `.value` from reactive helpers.
- 4050429: CORE reactivity fixes from the v0.3 review:
  - **core (L3):** `addTranslations()` no longer emits `configChanged` for runtime-added translations — it relies on the `namespaceLoaded` event (and the cache-revision bump) that `_nsAddTranslations` already fires, removing a redundant double re-render. **Behavior note:** if you have an external `on("configChanged", …)` listener that was reacting to `addTranslations`, switch it to `on("namespaceLoaded", …)`. `configChanged` is still emitted for fallback-locale and namespace-activation changes. An empty `addTranslations({})` is now a true no-op.
  - **core (L1):** the `Intl` formatter caches (number/date/relative-time) are now bounded (FIFO eviction at 1000 entries), mirroring the template cache. Prevents unbounded growth for apps formatting many distinct `(locale, options)` combinations via the per-call `locale` override.
  - **solid & svelte (M4):** the cache-revision signal/store now uses a single monotonic counter instead of summing two independent counters, which could collide non-monotonically and drop a re-render (e.g. a `configChanged` that didn't change the translation cache).
  - **vue (M1):** added imperative, non-reactive `hasTranslationNow(key, opts?)` and `hasLocaleNow(locale, namespace?)` returning plain booleans — for use in loops/handlers where the reactive `hasTranslation()`/`hasLocale()` (which allocate a `computed()` per call) would leak outside an effect scope. Re-exposed through `@comvi/nuxt`'s `useI18n()`.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

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
