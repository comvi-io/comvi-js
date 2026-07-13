# @comvi/core

## 0.4.1

### Patch Changes

- 67780e8: Support underscores in interpolation tag names, including paired and self-closing `snake_case` tags in ICU message branches.

## 0.4.0

### Minor Changes

- bec9ad6: Bundle-size pass for @comvi/core (−17% min, −7% gzip for consumers; more when formatters are unused).

  **BREAKING (@comvi/core):** `formatNumber` / `formatDate` / `formatCurrency` / `formatRelativeTime` and the `dir` getter moved off the `I18n` class to standalone tree-shakeable exports. Migrate `i18n.formatNumber(v, opts)` → `formatNumber(i18n, v, opts)` and `i18n.dir` → `getTextDirection(i18n.locale)`. Framework bindings (`useI18n`, `useFormatters`) keep their existing API — no changes needed in components.

  Other changes:
  - Internal class members now use native `#private`, so app bundlers mangle them (CDN UMD 25.5 → 21.2 kB).
  - `TranslationCache.getInternalMap()` returns the snapshot typed as `ReadonlyMap` without a runtime wrapper.
  - New `development` export condition ships readable error messages in dev; the production artifact keeps compact `E_*` codes.

- 38ce169: ICU apostrophe handling switched to DOUBLE_OPTIONAL mode (same as ICU4J, FormatJS, i18next and Tolgee):
  - A bare `'` starts quoted literal text only when it immediately precedes a syntax character. Everywhere else it is literal, so real-world content like `Superiors' behavior`, a trailing `l'` or `Gib' eine Bewertung` inside a select branch no longer breaks parsing or loses characters.
  - `{` and `}` are syntax characters everywhere; `#` counts as one only inside plural/selectordinal sub-messages (including select sub-messages nested in them), exactly like ICU4J. At the top level and in standalone selects `'#'` stays two literal characters.
  - `''` still collapses to a literal apostrophe, and `'{...}'` still escapes ICU syntax.
  - Plural/select branches that contain apostrophes but no `{`/`<` are now routed through the parser too, so `''` inside a flat branch renders as `'` instead of leaking the doubled apostrophe.
  - Fixed a template-cache bug where a message whose parsed output differs from its source (quoting, `&lt;`, `\<`) was flagged static after the first render and returned raw (with quoting artifacts) on every subsequent `t()` call.
  - Context-sensitive template and plural-choice caches now namespace both parser modes, preventing control-character-prefixed source text from colliding with internal cache markers.

  Behavior change: previously `o' clock` rendered as `o clock` (the bare apostrophe opened a quoted section). It now renders as `o' clock`. Messages relying on single-quote hiding of arbitrary text must either double the apostrophes or quote ICU syntax characters directly.

- aaea018: Instance-level `defaultParams`:
  - `createI18n({ defaultParams: { formality: "formal" } })` merges the given params under every `t()`/`tRaw()` call; call-level params override defaults key by key (shallow merge).
  - `defaultParams` contains non-nullish interpolation values only. Per-call controls (`locale`, `ns`, `fallback`, `raw`) and `null`/`undefined` values are rejected in types and at runtime.
  - `setDefaultParams(...)` replaces the defaults at runtime and emits `configChanged` (source: `"defaultParams"`), so framework bindings re-render automatically. Defaults guaranteed by the constructor cannot later be removed or changed outside the generated message schema; instances created without defaults may still set or clear dynamic defaults. Explicitly optional default properties are rejected because they cannot represent constructor guarantees.
  - Params objects are copied shallowly on write and read: top-level additions/reassignments do not mutate instance state, while nested arrays, VNodes, callbacks, and props retain identity and should be treated as immutable.
  - Typed core/Vue instances make constructor-guaranteed, type-compatible message params optional at call sites. Framework hooks remain conservative by default and accept an explicit defaults type when the provider scope guarantees it.
  - An ICU `select` whose param is missing still falls back to its `other` branch, which keeps missing-default setups rendering the informal/default text instead of breaking.

  All framework facades expose the same `defaultParams` / `setDefaultParams` names with idiomatic reactivity: Vue/Nuxt `ComputedRef`, React render snapshot, Solid accessor, and Svelte readable store. Typed translation calls carry the explicit defaults type in every binding, including Svelte stores. `createNextI18n()` and Nuxt client/request instances now forward constructor defaults.

### Patch Changes

- a5c80b8: State and input hardening:
  - `addTranslations` / the `translation` option no longer mutate the caller's object (`Object.setPrototypeOf` removed); flat catalogs are shallow-copied.
  - Non-string catalog leaves no longer crash `t()`: arrays/numbers are coerced with `String()` (dev warning), `null`/`undefined` leaves are dropped.
  - `isInitializing` stays `true` for the whole `init()`, even when a locale detector triggers a locale change mid-init.
  - Reverting to the current locale while another locale change is in flight now cancels that change (last request wins).
  - `clearTranslations()` / `reloadTranslations()` cancel matching in-flight namespace loads, so stale responses can't repopulate a cleared cache and reload always fetches fresh data.
  - Per-call `fallback` now skips the instance-level `onMissingKey` option (registered callbacks still fire).

- 6463199: Fix `#` binding in nested plurals.

  When a plural was nested inside another plural's option, the inner `#` octothorpe
  was substituted with the **outer** plural's count instead of its own. For example
  `{files, plural, other {# files in {folders, plural, other {# folders}}}}` with
  `{ files: 3, folders: 5 }` rendered `3 files in 3 folders` instead of `3 files in 5 folders`.

  The cause was a greedy `#` replacement that ran across the whole selected branch
  (including nested `{...}` blocks) before recursing into them. Replacement is now
  scoped to the current plural level: `#` inside nested blocks and quoted literals is
  left untouched, so each plural binds `#` to its nearest enclosing count, per the ICU
  MessageFormat spec.

## 0.3.0

### Minor Changes

- 1feaed4: Add a minified UMD/CDN build and improve runtime performance.
  - New `dist/comvi-core.global.prod.js` (~7.9 kB gzip) for `<script>` / unpkg / jsDelivr consumers, exposed via the `unpkg` and `jsdelivr` package fields. The main npm ESM/CJS entries remain unminified by design (consumers' bundlers re-minify); only this dedicated CDN artifact is minified.
  - Sourcemaps are no longer shipped in the published tarball (smaller install size).
  - `formatRelativeTime()` now caches its `Intl.RelativeTimeFormat` instances, matching the existing number/date format caches.
  - `dir` is memoized on the active locale, avoiding a per-access `Intl.Locale` construction and regex evaluation.
  - Fixed a cross-instance cache bug: clearing translations or destroying one `I18n` instance no longer wipes the shared compiled-template cache for other live instances (template parsing is locale-independent, so the cache stays valid). The template cache is now bounded with insertion-order eviction to prevent unbounded growth. No public API or behaviour change.

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- 88ae52a: Add optional `locale` parameter to `formatNumber()`, `formatDate()`, `formatCurrency()`, and `formatRelativeTime()` to override the instance locale on a per-call basis. Existing call sites without the argument continue to work — the helpers fall back to the instance locale. The optional argument enables framework bindings (e.g. `@comvi/react` `useFormatters()`) to thread the React-tracked locale through formatters so output stays in sync with concurrent rendering.

  The `I18n` interface in `@comvi/core/types` is updated to match the concrete class signature. Internal Intl format caches now key on `(locale, options)` so different override locales do not serve stale `Intl.NumberFormat` / `Intl.DateTimeFormat` instances.

- 4050429: CORE reactivity fixes from the v0.3 review:
  - **core (L3):** `addTranslations()` no longer emits `configChanged` for runtime-added translations — it relies on the `namespaceLoaded` event (and the cache-revision bump) that `_nsAddTranslations` already fires, removing a redundant double re-render. **Behavior note:** if you have an external `on("configChanged", …)` listener that was reacting to `addTranslations`, switch it to `on("namespaceLoaded", …)`. `configChanged` is still emitted for fallback-locale and namespace-activation changes. An empty `addTranslations({})` is now a true no-op.
  - **core (L1):** the `Intl` formatter caches (number/date/relative-time) are now bounded (FIFO eviction at 1000 entries), mirroring the template cache. Prevents unbounded growth for apps formatting many distinct `(locale, options)` combinations via the per-call `locale` override.
  - **solid & svelte (M4):** the cache-revision signal/store now uses a single monotonic counter instead of summing two independent counters, which could collide non-monotonically and drop a re-render (e.g. a `configChanged` that didn't change the translation cache).
  - **vue (M1):** added imperative, non-reactive `hasTranslationNow(key, opts?)` and `hasLocaleNow(locale, namespace?)` returning plain booleans — for use in loops/handlers where the reactive `hasTranslation()`/`hasLocale()` (which allocate a `computed()` per call) would leak outside an effect scope. Re-exposed through `@comvi/nuxt`'s `useI18n()`.

- 872680e: Close the React `useStoreRevision` re-render race for non-cache events (M3).

  A `configChanged` (fallback-locale / namespace-activation) or `defaultNamespaceChanged` that fired in the narrow window between a `useI18n` consumer's commit and its `useSyncExternalStore` subscribe-effect attaching could be dropped — the snapshot's per-component event counter started at 0 and only counted post-subscribe events, and these events don't bump the translation-cache revision.

  The fix makes the React store snapshot **content-addressed**: it derives purely from observable instance state (`translationCache.getRevision()` + `isInitialized` + default namespace + active namespaces + fallback locales) instead of a subscription-timing-dependent counter, so state mutated before the subscriber attached is detected on the post-subscribe re-read. As a bonus, a bare `configChanged`/`defaultNamespaceChanged` emit that does NOT change state no longer forces a spurious re-render.

  `@comvi/core` adds a small read-only `getFallbackLocales()` accessor used by the snapshot.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.
