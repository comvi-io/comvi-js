# @comvi/next

## 0.4.1

### Patch Changes

- Updated dependencies [67780e8]
  - @comvi/core@0.4.1
  - @comvi/react@0.4.1

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

- Updated dependencies [bec9ad6]
- Updated dependencies [a5c80b8]
- Updated dependencies [6463199]
- Updated dependencies [38ce169]
- Updated dependencies [aaea018]
  - @comvi/core@0.4.0
  - @comvi/react@0.4.0

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- 88ae52a: **Minor release — React 18+ baseline (via `@comvi/react`), render-time mutation removal, locale validation.**

  ### Added
  - Locale validation against `routing.locales` in `<I18nProvider>`. When the provider receives a `routing` prop and the `locale` prop is not in `routing.locales`, the provider calls `i18n.reportError(...)` with a descriptive diagnostic and skips the mutation. When `routing` is omitted, behavior is unchanged.

  ### Changed
  - `<I18nProvider>` internals: locale sync and message bootstrap moved from the render body to a `useState(() => ...)` lazy initializer. The previous render-time mutation pattern (`i18n.locale = locale`, `i18n.addTranslations(messages)` guarded by `isFirstRenderRef`) is replaced; the side effect now lives in a React-blessed lifecycle slot before the first commit. Behavior is identical from a consumer's perspective.
  - `<Link>`, `usePathname()`, and `useLocalizedRouter()` switched from `useI18n()` to `useLocale()` — non-translation routing consumers no longer re-render on namespace loads.

  ### Removed
  - React 16.8–17 peer support via the `@comvi/react` 0.3 release.
  - Duplicate `src/client/index.ts` re-export module — `src/client.ts` is the single source of truth for the `./client` subpath.

  ### Internal
  - Peer dependencies on `@comvi/core` and `@comvi/react` bumped accordingly.
  - New `next-hydration.test.tsx` asserts `renderToString` + `hydrateRoot` produces zero hydration warnings, and a boundary test asserts no `i18n.locale = …` mutation appears outside the dedicated `syncLocaleSafely` helper in `client/I18nProvider.tsx`.

  See CHANGELOG for the per-package upgrade checklist.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

- a66dbc8: Re-export the v0.3 selector hooks from `@comvi/next/client`.

  `useLocale`, `useIsLoading`, `useSetLocaleTransition`, and `useFormatters` (plus the
  `UseSetLocaleTransitionReturn` and `UseFormattersReturn` types) are now re-exported
  from `@comvi/next/client`, matching `@comvi/react`. Previously these headline v0.3
  hooks were only reachable by adding a separate `@comvi/react` dependency, despite
  `@comvi/next/client` being the documented import path for Next apps.

- Updated dependencies [1feaed4]
- Updated dependencies [e1f4ccb]
- Updated dependencies [6e5370c]
- Updated dependencies [8e01e2b]
- Updated dependencies [88ae52a]
- Updated dependencies [88ae52a]
- Updated dependencies [4050429]
- Updated dependencies [872680e]
- Updated dependencies [c705faf]
  - @comvi/core@0.3.0
  - @comvi/react@0.3.0

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0
  - @comvi/react@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1
  - @comvi/react@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
  - @comvi/react@1.0.0
