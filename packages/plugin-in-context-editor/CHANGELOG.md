# @comvi/plugin-in-context-editor

## 0.4.0

### Minor Changes

- 3c95b54: Passive UI-context collector for active in-context-editor sessions:
  - Observes visible translation targets (IntersectionObserver-driven, event-triggered, no polling) and sends structural/semantic/constraint signals plus neighbor key refs to the platform's context API — never rendered text.
  - Screens are grouped by an opaque digest of the normalized route by default; the new `screenGroupResolver` option lets integrations supply a readable, PII-free route template (e.g. `/users/:id`) instead. Modal id/testid/labelledby discriminators are digested, not sent verbatim.
  - Targets inside an open dialog get a modal-suffixed screen group; background keys keep the route group.
  - Mutation-class triggers (DOM/attribute/text/translation/route/resize) re-evaluate signals even when the visible key set is unchanged, so same-key drift converges; the transport's per-item hash gate keeps unchanged re-evaluations off the network, and failed batches retry instead of being dropped.
  - `collectContext: false` opts out entirely and is honored from both the plugin factory and standalone activation.

### Patch Changes

- 2aeb0d4: Reduce the editor's consumer bundle cost and harden browser storage:
  - npm ESM output is no longer minified; minification remains the standalone CDN build's responsibility
  - the Vue modal, key selector, and their CSS load on the first edit interaction while the Collector lifecycle remains active from plugin startup
  - stopped editor instances ignore late lazy imports and UI failures are reported without unhandled rejections
  - selected-language storage tolerates blocked reads/writes, malformed JSON, and non-array values
  - the insecure page-level API-key event channel remains disabled

- 8c4ed91: Pin the `@comvi/core` peer range to the minor line each release ships with (`^0.3.0` for 0.3.x, auto-synced to `^0.4.0` at the next release by `scripts/sync-peer-ranges.mjs`). Prevents the out-of-range escalation that turned the whole fixed group into a major bump at version time.
- Updated dependencies [01b40e9]
- Updated dependencies [60ee056]
- Updated dependencies [8c4ed91]
  - @comvi/plugin-fetch-loader@0.4.0

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

- a0906b6: Declare standalone IIFE as a side-effectful entry so bundlers do not tree-shake it.
- Updated dependencies [e1f4ccb]
- Updated dependencies [6e5370c]
  - @comvi/plugin-fetch-loader@0.3.0

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0
  - @comvi/plugin-fetch-loader@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1
  - @comvi/plugin-fetch-loader@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
  - @comvi/plugin-fetch-loader@1.0.0
