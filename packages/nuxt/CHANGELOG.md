# @comvi/nuxt

## 0.4.1

### Patch Changes

- Updated dependencies [67780e8]
  - @comvi/core@0.4.1
  - @comvi/vue@0.4.1

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

- 0ffa70d: Locale detection from a query parameter:
  - `detectBrowserLanguage.queryParam: "lang"` makes the route middleware read an explicit locale from the URL query (e.g. `?lang=de`) on both server and client navigation. Disabled when unset.
  - Priority: explicit path prefix > query parameter > implied default of a prefixless path (as-needed mode) > cookie > Accept-Language > fallback. Values outside `locales` are ignored.
  - With `localePrefix: "never"` and cookies disabled this reproduces the classic public-page setup (query beats Accept-Language, URLs stay untouched).
  - `useSwitchLocalePath()` keeps the configured locale query synchronized with its target locale in every prefix mode, while preserving unrelated query parameters and hashes.

### Patch Changes

- 641245b: Fix three binding bugs found in the fleet-wide package audit:
  - **nuxt**: replaced the Nuxt 2-era `process.dev` with `import.meta.dev` in `useSwitchLocalePath` so the invalid-locale dev warning actually fires.
  - **vue**: `formatNumber`/`formatDate`/`formatCurrency`/`formatRelativeTime` read the non-reactive core locale, so template usages did not re-render after a locale switch (React binding already behaved correctly). They now default to the reactive locale ref.
  - **plugin-locale-detector**: cookies written with `sameSite: "none"` but no `secure` flag are rejected by modern browsers; `Secure` is now forced for `SameSite=None`.

- Updated dependencies [641245b]
- Updated dependencies [bec9ad6]
- Updated dependencies [a5c80b8]
- Updated dependencies [6463199]
- Updated dependencies [38ce169]
- Updated dependencies [aaea018]
  - @comvi/vue@0.4.0
  - @comvi/core@0.4.0

## 0.3.0

### Minor Changes

- a9e7e16: **BREAKING:** In `localePrefix: "as-needed"` mode, a non-root path without a locale prefix now resolves to the default locale unconditionally. Previously the middleware consulted the cookie/`Accept-Language` first, which caused two visible problems:
  - Switching back to the default locale from a non-default one would immediately bounce the user back via the cookie (e.g. on `/de/about` → switcher click on EN → `/about` → redirect to `/de/about`).
  - Any direct navigation to an unprefixed page would honor a stale cookie instead of the URL.

  The URL is now authoritative for non-root paths in `as-needed` mode. Cookie / `Accept-Language` detection still runs on the root path (`/`) so first-visit auto-detection continues to work as before. This matches `@nuxtjs/i18n`'s default `redirectOn: "root"` behavior.

  **Cookie semantics:** the locale cookie now represents the user's persisted _preference_, not the last rendered locale. Passively navigating to a path-implied default URL (e.g. cookie `de`, user visits `/about`) renders the URL's locale but preserves the cookied preference, so a subsequent visit to `/` still redirects to `/de`. Language switchers must call `setLocale(target)` before `navigateTo(switchLocalePath(target))` so the explicit choice is recorded — the test apps in `test-apps/nuxt*` show the pattern.

  No migration is required for typical setups. If you relied on cookie-driven redirects on arbitrary URLs, switch to `localePrefix: "always"` (every path carries a prefix) or handle the redirect explicitly in a route middleware.

  Also drops the unused `packages/nuxt/playground` directory; the `dev` script now produces a stub build so the test apps in `test-apps/nuxt` and `test-apps/nuxt4` can drive the module live.

- c473f32: Align Nuxt with the Vue/Core 0.3 runtime API and composable return shape.

  Nuxt's `useI18n()` facade now tracks the Vue 0.3 reactive helpers exposed by `@comvi/vue`, while the module keeps its existing setup and routing ergonomics. This makes the Nuxt package part of the 0.3 framework API release instead of publishing a patch that would pull in new 0.3 runtime dependencies.

  Also fixes locale middleware fallback resolution when `detectBrowserLanguage.fallbackLocale` is an array: the middleware now selects the first configured fallback that is present in `locales` instead of falling back to `defaultLocale`.

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

- a0906b6: Declare `h3` as a direct dependency: the Nitro server utilities import `getCookie`/`getHeader` from `h3` at runtime, and it was previously only transitively available via `@nuxt/kit`. Also register composable auto-imports explicitly and give the module a nameable `NuxtModule` type, so the published `.d.ts` ships stable `#imports` types and a portable default-export type. No public API or runtime-behaviour change.
- f466eda: Fail fast when the `comvi.setup` hook throws. Previously setup errors were swallowed outside dev mode and `i18n.init()` ran anyway, which could leave the app in a partially configured state (missing loaders/hooks) with hard-to-diagnose behaviour. The error is now rethrown in all environments after being reported.
- 20f6e38: Bump `nuxt` and `@nuxt/schema` devDependencies from `^3.21.0` to `^3.21.4` to pull in patched transitive `defu@6.1.7` (security fix). No runtime API change for `@comvi/nuxt` consumers.
- 82dbcf1: Align package metadata.
  - Fix `repository.url` to include the required `git+` prefix.

- Updated dependencies [1feaed4]
- Updated dependencies [e1f4ccb]
- Updated dependencies [6e5370c]
- Updated dependencies [88ae52a]
- Updated dependencies [c473f32]
- Updated dependencies [4050429]
- Updated dependencies [872680e]
  - @comvi/core@0.3.0
  - @comvi/vue@0.3.0

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0
  - @comvi/vue@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1
  - @comvi/vue@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
  - @comvi/vue@1.0.0
