# @comvi/plugin-locale-detector

## 0.4.0

### Minor Changes

- 7584363: `cacheFirst` option:
  - By default the first cache target is consulted before the detection `order`, so a persisted locale wins over everything, including an explicit query parameter.
  - Set `cacheFirst: false` to let `order` fully govern priority — e.g. `order: ["querystring", "localStorage", "navigator"]` makes `?language=fr` override the locale stored on a previous visit, while storage still persists changes and is still read when no stronger source matches.

### Patch Changes

- 641245b: Fix three binding bugs found in the fleet-wide package audit:
  - **nuxt**: replaced the Nuxt 2-era `process.dev` with `import.meta.dev` in `useSwitchLocalePath` so the invalid-locale dev warning actually fires.
  - **vue**: `formatNumber`/`formatDate`/`formatCurrency`/`formatRelativeTime` read the non-reactive core locale, so template usages did not re-render after a locale switch (React binding already behaved correctly). They now default to the reactive locale ref.
  - **plugin-locale-detector**: cookies written with `sameSite: "none"` but no `secure` flag are rejected by modern browsers; `Secure` is now forced for `SameSite=None`.

- 8c4ed91: Pin the `@comvi/core` peer range to the minor line each release ships with (`^0.3.0` for 0.3.x, auto-synced to `^0.4.0` at the next release by `scripts/sync-peer-ranges.mjs`). Prevents the out-of-range escalation that turned the whole fixed group into a major bump at version time.

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

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
