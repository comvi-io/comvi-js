# @comvi/cli

## 0.4.1

## 0.4.0

### Patch Changes

- 64fb50a: CLI hardening from the fleet-wide audit:
  - `--version` now reports the real package version (was hardcoded `1.0.0`)
  - `.comvirc.json` is atomically replaced from an exclusive `0600` temp file when it contains an `apiKey`, so an existing permissive config never exposes the new secret; `comvi init --api-key` prints a warning that argv secrets are visible to `ps` and shell history
  - API client: bounded retry with exponential backoff for `429` (honoring both seconds and HTTP-date `Retry-After` values, capped at 30s) and for `5xx`/network errors on idempotent GETs; push commits are never retried after send
  - request timeout timers are now cleared in `finally` across all API methods
  - translation and type files are written atomically through unique exclusive temp files with failure cleanup, so interrupted or concurrent `pull`/`typegen` operations never share a temp path or leave truncated output
  - SSE schema updates are processed serially and queued events are discarded after cleanup or subscription replacement
  - `eventsource` is lazily imported only in watch mode, shaving startup cost from every other command
  - new `comvi pull --dry-run` flag lists the files a pull would write without touching the filesystem

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- c423773: Change the default local translation file layout for v0.3. The namespace marked as default in the TMS now maps to root locale files such as `en.json`, while other namespaces map to `{namespace}/{languageTag}.json` such as `admin/en.json`.

  `comvi pull`, `comvi push`, and CLI type generation now resolve the default namespace from the backend instead of treating `.comvirc.json` as the source of truth. Custom `fileTemplate` values remain literal; set `"fileTemplate": "{languageTag}/{namespace}.json"` to keep the v0.2 layout.

### Patch Changes

- c705faf: Polish from the v0.3 review (no behavior change to existing valid usage):
  - **cli:** warn (and ignore) when a `.comvirc.json` carries the deprecated `languages` field — it was renamed to `locales`. Mirrors the existing `defaultNsName` deprecation warning.
  - **svelte:** tighten `TProps.params` from `Record<string, unknown>` to `TranslationParams`, matching `@comvi/solid` and what `tRaw` actually accepts.
  - **react:** document the `useSetLocaleTransition()` and `useFormatters()` hooks in the README.

## 0.2.0

### Minor Changes

- 9a78710: Auto-load `.env` for all CLI commands (`pull`, `push`, `init`, `generate-types`). The CLI walks up from the cwd to find the nearest `.env` file, stopping at the project root (the directory containing `package.json`) so it never picks up unrelated files in shared CI build directories.

  Variables already set in `process.env` are **never** overwritten — real env vars always win over the file. This makes the auto-load safe to enable for CI: a checked-in `.env` cannot shadow a `COMVI_API_KEY` exported by your pipeline.

  Parsing uses Node's built-in `util.parseEnv` (Node ≥20.12), so no new runtime dependencies. `init`'s help message ("add to .env file") now matches actual behaviour.

  **New global flags**
  - `--env-file <path>` — load a specific file instead of auto-discovery.
  - `--no-env-file` — skip auto-loading entirely (also: `COMVI_NO_ENV=1`).
  - `COMVI_DEBUG=1` — print the loaded path on stderr.

  **Note:** Node 20.6+ also recognises `--env-file` as a built-in flag. If the path you pass is missing, Node fails first with exit code 9 (its own "file not found") before the CLI runs. When the file exists, Node passes the flag through to the CLI and our non-overwrite loader handles it.

- 5994f2f: Add top-level `namespaces` and `locales` filters to `.comvirc.json`. Lets a project declare which namespaces/locales it uses once in config, instead of repeating `--ns a,b,c` / `--locale en,uk` in every `package.json` script that runs `comvi pull` / `comvi push`. CLI flags `--ns` / `--locale` continue to fully override the config (no merge), enabling one-off pulls without editing the file.

  Pull now diffs the requested filter against what the server returned and fails with exit code 4 if any namespace or locale is missing — typos in `.comvirc.json` (or in `--ns` / `--locale`) surface as a hard error in CI instead of silently producing empty translation files. The same exit code is used when validation rejects the config (e.g. `"namespaces": []`).

  Push respects the same filter via the existing `TranslationSync.readTranslations` filter, so it only uploads the configured subset.

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- 1b76399: Drop unused `@comvi/core` runtime dependency. The CLI never actually imported anything from `@comvi/core` — it only emits the strings `import '@comvi/core'` and `declare module '@comvi/core'` into generated `i18n.d.ts` files for the user's project to compile. Those references resolve in the user's tree (which already has `@comvi/core` via `@comvi/vue` / `@comvi/react` / etc.), so removing the CLI-side dep is safe and shrinks the install footprint by one transitive package.

  Not promoted to `peerDependencies` — `peer` would imply the CLI itself needs `@comvi/core` to run, which it doesn't. The generated `.d.ts` is a build artifact whose dependencies are the user's responsibility, not the CLI's.

- 25f5f4d: Fix `ConfigLoader.create()` silently dropping `namespaces` and `locales` when writing config. Previously a load → modify → save round-trip — anything that imports `ConfigLoader.create()` and round-trips a config — would lose the filter fields because `configToWrite` only emitted a fixed list of known keys. Now they're persisted when set (omitted when undefined, so `comvi init` doesn't bake an empty filter into a fresh config).

  Also clarifies the README wording about `.env` discovery: the loader walks up from the current working directory, bounded by the project root (the previous text said "from the project root", which was accurate only for the common case of `cwd === project root`).

- cba88bf: Fix broken documentation URLs in published READMEs. The `@comvi/cli` README pointed at `/docs/i18n/tooling/cli/` (404) — corrected to `/docs/cli/`. The `@comvi/vite-plugin` README's documentation links pointed at `/docs/i18n/tooling/vite-plugin/`, which doesn't exist at any URL — links removed until docs ship.

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
