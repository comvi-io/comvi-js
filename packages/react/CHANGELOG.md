# @comvi/react

## 0.4.1

### Patch Changes

- Updated dependencies [67780e8]
  - @comvi/core@0.4.1

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

- 88ae52a: **Minor release — React 18+ baseline, internal architecture refactor, additive selector hooks.**

  ### Added
  - `useLocale()` hook — narrow locale-only subscription for components that don't need the full i18n bag (e.g. `<Link>`, routing utilities). Skips re-renders on namespace loads and loading-state changes.
  - `useIsLoading()` hook — selector hook returning `{ isLoading, isInitializing }`. Skips re-renders on locale/translation changes.
  - `useSetLocaleTransition()` hook — wraps `i18n.setLocaleAsync()` in `React.useTransition` so the previous UI stays interactive while the new locale loads. Returns `{ isPending, setLocale }`.
  - `useFormatters()` hook — returns memoized `{ formatNumber, formatDate, formatCurrency, formatRelativeTime }` bound to `useLocale()` so formatter output auto-updates on locale change.

  ### Changed
  - **Internal architecture:** provider now uses a 2-context split — `LocaleContext` (string axis) plus `I18nInstanceContext` (i18n + loading state). `cacheRevision` is no longer broadcast to all subscribers; `<T>` reads it directly via `useSyncExternalStore`. Public `useI18n()` API surface is unchanged.
  - `t()` and `tRaw()` returned by `useI18n()` now rebuild on locale change (memo deps include `locale`). The React-tracked locale is injected into every bound translation call, closing a tearing surface where the bound function previously read the mutable `i18n.locale` at call time during `startTransition`-wrapped locale flips. Code that depended on stable `t` identity across locale flips needs to adapt; the new behavior is the intended fix.

  ### Deprecated
  - `useI18nContext()` — works through 0.3 but is scheduled for removal in a future major. Use `useI18n()` instead (same return shape, finer-grained subscriptions).

  ### Removed
  - **React 16.8–17 peer support.** Requires `"react": "^18.0.0 || ^19.0.0"`. Users on React 17 should stay on `@comvi/react@^0.2.x`.
  - `use-sync-external-store` shim dependency — replaced with the native `useSyncExternalStore` from React 18+.

  ### Fixed
  - Non-translation consumers (`<Link>`, `usePathname()`, etc.) no longer re-render on every namespace load — measurement-confirmed via the new commit-counter harness.
  - `useI18n()` formatter methods (`formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime`) now use the React-tracked render locale, matching `useFormatters()` and avoiding mutable-instance locale reads during concurrent locale changes.
  - `useSubscribe()` event-list fragility — refactored to rest-args with a stable join-key dependency so dynamic event arrays no longer get a stale subscription.
  - `<T>` type safety — replaced `as any` overload-bridge casts with `as never`; `BIND_METHODS` bag now uses a mapped type instead of `Record<string, unknown>`.
  - `<T>` per-render allocation — no longer allocates `new Map()` + `{}` for tag handlers when the `components` prop is undefined (the common case).
  - `<T>` `React.cloneElement` usage migrated to function composition / `React.createElement` (closes a React 19 soft-deprecation).

  ### Internal
  - Peer dependency on `@comvi/core` bumped to the new minor.
  - Unit tests + Profiler-based commit-counter harness + tearing repros (happy-dom) + Playwright e2e (in `test-apps/next`) verify the changes.

  See CHANGELOG for the per-package upgrade checklist.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

- 8e01e2b: Fixed: React's "Cannot update a component (`X`) while rendering a different component (`Y`)" warning no longer fires when a parent component synchronously emits an i18n event during render (e.g. `<I18nProvider messages={...}>` re-rendering on locale change triggers `addTranslations` from its `useState` initializer).

  Internal: `useSubscribe` and `useStoreRevision` now defer React's store-update notification by one microtask (`queueMicrotask`), breaking the synchronous `_emit → subscribe-callback → scheduleUpdateOnFiber` chain that produced the warning (see `packages/core/src/core/i18n.ts:438-448`). A `disposed` flag prevents stale callbacks after unsubscribe or `i18n` prop swap. The revision counter in `useStoreRevision` is still bumped synchronously so `getSnapshot` reads always see the latest value.

  **Significantly narrows** the v0.3.1 KNOWN LIMITATION previously documented in `useI18n.ts:45-53` (residual race window depends on React-internal subscribe-set-up vs first-event ordering).

  Pre-1.0 internal change; consumer API unchanged.

- 872680e: Close the React `useStoreRevision` re-render race for non-cache events (M3).

  A `configChanged` (fallback-locale / namespace-activation) or `defaultNamespaceChanged` that fired in the narrow window between a `useI18n` consumer's commit and its `useSyncExternalStore` subscribe-effect attaching could be dropped — the snapshot's per-component event counter started at 0 and only counted post-subscribe events, and these events don't bump the translation-cache revision.

  The fix makes the React store snapshot **content-addressed**: it derives purely from observable instance state (`translationCache.getRevision()` + `isInitialized` + default namespace + active namespaces + fallback locales) instead of a subscription-timing-dependent counter, so state mutated before the subscriber attached is detected on the post-subscribe re-read. As a bonus, a bare `configChanged`/`defaultNamespaceChanged` emit that does NOT change state no longer forces a spurious re-render.

  `@comvi/core` adds a small read-only `getFallbackLocales()` accessor used by the snapshot.

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
