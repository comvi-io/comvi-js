# @comvi/cli

## 0.6.0

### Patch Changes

- 1fb2046: Generated types accept a number for a bare `{name}` and for a `select` variable: such a parameter is now `string | number`, not `string`. `t("errors.count", { count: 3 })` against `"Reported misses: {count}"` no longer fails `tsc`; the runtime always rendered it. A `plural` or `selectordinal` count stays `number`. `comvi typegen` and `comviTypes()` still write byte-identical files, so a file with such a parameter has to be regenerated once after upgrading, or `comvi typegen --check` reports it as stale.

## 0.5.0

### Minor Changes

- 09029b0: **BREAKING (breaking change on a 0.x minor): type generation has one command name, `comvi typegen`.** The `generate-types` and `generate` spellings are removed; `comvi init` prints `comvi typegen` in its next steps.

  **BREAKING (breaking change on a 0.x minor): `.comvirc.json` refuses fields it does not have.** A field `ComviConfig` does not declare fails `load` with exit code 4 and names it: `".comvirc.json" field "outputDir" is not an option.` For `languages` the message says `use "locales"`; for `defaultNsName` it says the default namespace is read from the TMS, so delete it. Both used to be dropped with a warning.

- 09029b0: `comvi typegen --check` now has distinguishable exit codes, and `comvi init` refuses a malformed
  `--api-url` instead of writing it.
  - **`--check` exit 1 means "outdated", not "something went wrong".** A failed TMS request —
    network blip, expired key, 5xx — used to exit 1, exactly like genuinely stale types, so CI
    could not tell a broken pipeline from real drift. The check now exits **2** and prints
    `✗ Check could not run: …` when the schema request fails (`API_CONNECTION_FAILED`,
    `API_AUTH_FAILED`, `API_FETCH_FAILED`, `API_TIMEOUT`, `API_INVALID_RESPONSE`), keeping **1**
    for a real verdict of outdated. A configuration that fails validation now exits **4**, the
    code `pull` and `push` already used — it also exited 1 before. The `--check` help text
    documents all three.
  - **`comvi init -u <not-a-url>` used to blame the API key and write the bad value anyway.**
    `ApiClient` rejected the URL from inside the key-validation block, so the output read
    `⚠ API key validation failed: Invalid API base URL: …` and the config was still created with
    the unusable URL. `init` now validates `--api-url` first, prints `✗ Invalid API base URL: …`
    and exits 4 without writing a config or calling the API.

- 09029b0: **Config discovery stops at your project, instead of walking to the filesystem
  root.** `comvi` climbed from the working directory all the way up looking for
  `.comvirc.json`, so a stray one in `$HOME` or in a shared CI working directory
  was adopted, with whatever `apiKey` it carried.

  The walk now stops at the first directory containing `package.json`, the same
  bound `.env` discovery has always used.

  **A workspace package no longer inherits the repo-root config.** The bound is
  the nearest `package.json`, not the project root, so in a pnpm/npm/turbo
  monorepo a command run from `apps/web` stops at `apps/web/package.json` and
  never sees `.comvirc.json` at the repo root. 0.4.1 found it. This is the one
  layout where the new bound changes a working setup, and it fails loudly with
  `No .comvirc.json found`.

  Two ways to keep a repo-root config: point at it explicitly with
  `--config ../../.comvirc.json` (the same fix for a config kept deliberately
  above the project root), or add a `.comvirc.json` to the package you run from.

- 09029b0: **Breaking:** `--env-file <path>` is now `--dotenv <path>`, and `--no-env-file` is now
  `--no-dotenv`. `COMVI_NO_ENV=1` is unchanged.

  The old names could not be made to work. Node claims `--env-file` for itself across the _entire_
  command line — not just the arguments before the script path — so
  `comvi --env-file missing.env pull` never reached the CLI at all: node printed
  `node: missing.env: not found` and exited **9**, while the documented behaviour
  (`✗ --env-file points to a missing file: …`, exit 4) was unreachable. When the file existed node
  passed the flag through without loading it, so the flag half-worked and failed opaquely. Verified
  on Node 24 and 25, and identically through the `comvi` bin shim.

  Under the new name the flag behaves as documented: a missing file is reported as
  `✗ --dotenv points to a missing file: <path>` with exit code 4, and `--no-dotenv` skips
  auto-discovery. Rename the flag in any scripts or CI jobs that pass it; `COMVI_NO_ENV=1` keeps
  working as the environment-variable equivalent of `--no-dotenv`.

- 09029b0: `comvi push` now exits with code 4 when the force mode is invalid, whether it came from
  `--force-mode` or from `push.forceMode` in `.comvirc.json`. It used to exit 1, which is the
  generic-failure code, while every other validation failure — an unparseable config, an unknown
  namespace — already exited 4. Scripts that branch on the exit code can now treat 4 as "you gave
  me bad input" for this case too; anything still checking for 1 here needs updating.
- 09029b0: `comvi init` no longer destroys an existing `.comvirc.json`, and its next-steps list is
  numbered correctly.
  - **Re-running `init` in a configured project used to overwrite the config silently.**
    `ConfigLoader.create()` writes the file wholesale, so a second `comvi init` replaced it with
    a freshly defaulted object — dropping `namespaces`, `locales`, `push.forceMode`,
    `pull.emptyDir` and any custom paths, with no prompt and no backup. `init` now checks for the
    file first and, unless `--force` is passed, prints the path and exits 1 without touching the
    file or contacting the API. Pass the new `--force` flag to get the old overwrite behaviour.
  - **The "Next steps" list skipped a number.** With an API key configured — the common case —
    the steps printed as 1, 3, 4, 5, because the shared tail lines were hardcoded to 3-5 while
    the branch above them printed a single step 1. The list is now numbered contiguously in both
    branches, and the `--watch` alternative is shown as a hint under the typegen step
    rather than as a step of its own.

- 09029b0: `comvi push` now flattens nested JSON to dotted keys instead of uploading `[object Object]`.

  `pull` writes flat files with dotted keys, but `push` forwarded a parsed file verbatim, and the
  API stringifies every value it is handed. A nested catalog such as `{"nav": {"home": "Home"}}`
  therefore uploaded one key `nav` whose value was the literal string `[object Object]`.

  `push` now flattens plain nested objects into dotted keys (`nav.home`), so both file shapes
  upload identically and an already-flat file passes through key for key. `--dry-run` and the
  conflict diff read the same flattened keys. A non-string leaf (number, boolean, null, array)
  is no longer silently coerced: the push fails with exit code 4 and names the file and the
  dotted key.

  A key that appears both flat and through nesting (`"a.b"` next to `{"a": {"b": …}}`) is also
  an error rather than a silent last-writer-wins.

- 09029b0: Type generation now runs on one shared emitter, the same one `@comvi/vite-plugin` uses, so the two tools cannot drift. The emitter is workspace-private and is bundled into this package — **no new dependency, nothing extra to install**, and the published types still declare `SchemaParam`, `KeySchema` and `ProjectSchema` themselves.
  - **Generated files no longer carry a `Generated at:` line.** `comvi typegen` on an unchanged schema rewrites the same bytes, instead of producing a diff on every run.
  - **`comvi typegen --check` drops the vanished header line from both sides**, so the `Generated at:` line 0.4 wrote is not by itself a stale verdict. Regenerate once after upgrading: files written by 0.4 compare as outdated under `--check` until then, because 0.5 quotes keys and parameter names with `JSON.stringify` where 0.4 emitted single quotes and bare names, and the comparison does not normalize quoting. Run `comvi typegen` and commit the re-quoted file in the upgrade commit.
  - **`--check` exits 4, not 1, when the schema itself cannot be emitted** (two keys that collide once the default namespace is stripped). Exit 1 under `--check` means "types are outdated", so that failure was indistinguishable from real drift. The sibling refusal, an unsupported param type, exits 4 under `--check` as well. Outside `--check`, a generation failure exits 1; an invalid config still exits 4. So a CI step that keys on 4 for "this schema cannot be emitted" has to run `--check`.
  - **`TypeEmitter` stays public.** `new TypeEmitter().generate(schema, { defaultNsName })` and the `comvi typegen` command are the two supported entry points, unchanged.

### Patch Changes

- 09029b0: `publishConfig.access` is now declared as `public` in every published manifest.

  `access: "public"` previously lived only in `.changeset/config.json`, so it applied to
  `changeset publish` and nothing else. Any other publish path had to remember `--access public`
  or npm would refuse the scoped package as private. The declaration now travels with each
  manifest. No code changed.

- 09029b0: The CLI now cancels the response body of every retried 429/5xx, every 401 and every permission-denied 403 answer instead of leaving a stalled stream and its socket open.
- 09029b0: `.comvirc.json` values are now validated on load, so an unsupported `format`, a non-string path or template, or a non-http(s) `apiBaseUrl` fails with a CONFIG_INVALID error naming the field before any request or file write.
- 09029b0: Build hygiene only, no shipped-output change: `vite.config.ts` now sets `build.emptyOutDir: true` explicitly instead of relying on Vite's implicit default, so a real build always starts from an empty `dist` even if a stray file from an earlier package layout is sitting there.
- 09029b0: **`comvi pull --empty-dir` no longer deletes before the fetch; filtered pulls clear only
  their scope.** The clear used to run first, so a network failure or a typo in `--ns` /
  `--locale` left the working copy emptied and nothing written in its place. It now runs after
  the translations have arrived and after every requested locale and namespace has been
  confirmed present, so a failed pull leaves the directory exactly as it was.

  The clear also follows the filters, in `rsync --delete` terms: `--ns common --empty-dir`
  removes only `common`'s files and leaves every other namespace alone, and a directory the
  clear empties is removed with its files. Without filters the whole directory is still
  cleared, and the refusal to clear a path outside the project is unchanged.

  `--empty-dir --dry-run` now lists every file it would remove instead of printing a single
  line.

- 09029b0: `comvi push` now honours `push.forceMode` from `.comvirc.json`. The `--force-mode` flag was
  declared with a baked-in `"ask"` default, so the flag value was always set and the configured
  mode could never be read — a project that configured `"override"` still died in CI with
  `--force-mode ask requires an interactive terminal`. The flag now defaults to unset and falls
  back to `push.forceMode`, then to `ask`; passing `--force-mode` explicitly still wins.
- 09029b0: **Security: `comvi pull` now keeps every file it writes inside the configured translations
  directory.** Locale and namespace names arrive from the TMS response and were interpolated
  straight into the file template, so a response naming a locale `../../outside` produced a path
  outside the catalog and `pull` would have written there. Every resolved path is now checked
  against the translations directory with `path.relative`, and the check is repeated against the
  resolved real paths before the directory is created and before the file is written, so a symlink
  inside the tree that points out of it is refused as well. The translations directory may itself
  be a symlink.

  A name is refused only for what makes a path unsafe: a `/` or `\` separator, a control
  character, a leading dot, an empty name, or the literal `__proto__`. Everything the platform
  lets you create still pulls — a namespace with a space, an `@`, or non-ASCII text writes exactly
  as it did in 0.4.1, up to the platform's own limits of 255 characters for a namespace and 50 for
  a locale code.

  The whole response is judged before anything happens: every locale and namespace it declares,
  then every resolved path, and only then the first `mkdir`. A name the CLI refuses now costs the
  project nothing — it used to abort from inside the write loop, which with `--empty-dir` meant the
  catalog was already deleted and only the namespaces sorted before the offending one came back,
  on every run. `pull --dry-run` refuses the same names a real write would, and the error names the
  offending value, where it came from, and what is wrong with it.

  **Security: a locale or namespace named `__proto__`, `constructor` or `prototype` no longer
  reaches `Object.prototype`.** The translations map was an ordinary object, so a response naming
  a locale `__proto__` looked up the shared prototype instead of an empty slot and the write landed
  on every object in the process; the same pattern read local catalogs and built the push payload,
  and a `__proto__` namespace replaced a locale map's prototype outright. All three levels of the
  map are now null-prototype dictionaries read by own key only, so those names are ordinary
  entries — and a `pull` still refuses to turn `__proto__` into a file name.

  **`comvi push` no longer invents conflicts for keys named `constructor`, `toString`, `valueOf` or
  `hasOwnProperty`.** A remote catalog is an ordinary JSON object, so looking up one of those keys
  answered with an inherited function instead of "the remote does not have this key". A local
  catalog holding any of them made `--force-mode abort` refuse a perfectly clean push, made
  `keep` report them as skipped, and made `push --dry-run` show them as conflicts instead of new
  keys. Key-level maps from the API are null-prototype now, and both comparisons use own-key
  lookups, so a key named after anything on `Object.prototype` is compared as the ordinary key it
  is.

  **Security: `"emptyDir": "false"` in `.comvirc.json` no longer deletes the catalog.** A quoted
  `"false"` is a truthy string, so the option that clears the translations directory before a pull
  was enabled by the exact value that reads as "off" — and nothing checked it. `pull.emptyDir` and
  `strictParams` must now be a boolean or absent, `pull` and `push` must be objects, and each is
  refused while the config is loading, before any request is sent or any file removed. The error
  names the key and the type it received (a `null` is reported once, not as "null null"), and the
  exit code is 4 like every other invalid configuration. `push.forceMode`, the other destructive switch, was already checked against its
  four allowed modes before `push` sent anything.

- 09029b0: The request timeout now covers the response body, API failures show the platform's error message, and `push` reads back every namespace and locale `pull` writes. `pull --empty-dir` restores the previous catalog when a write fails, `init --force` replaces the config atomically, and `.comvirc.json` refuses a non-object root, unknown `push`/`pull` fields, an unknown `forceMode` and an `augment` that is not a module specifier, all with exit code 4.
- 09029b0: **Generated declarations are valid TypeScript for every key.** Key and parameter names are
  now emitted as JSON strings, so a key containing an apostrophe (`errors.it's`) no longer
  closes its own quote and produces a file the compiler cannot parse, and a parameter named
  `user-name` no longer emits a bare identifier that is not a legal property name.

  A parameter whose type is neither `string` nor `number` is rejected, naming the key, the
  parameter and the type, instead of being pasted verbatim into the declarations.
  `comvi typegen --check` exits 4 for it. Outside `--check`, a generation failure exits 1
  (an invalid config still exits 4), so key CI on 4 only under `--check`.

  `comvi typegen --check` counts keys in an existing declaration file written in either quote
  style, so the check keeps working against a file left by an earlier version.

- 09029b0: The shipped `.d.ts` files now use extension-qualified relative specifiers (`./options.js`,
  `./cdn/index.js`), so the published types resolve under `moduleResolution: node16` and
  `nodenext` — the mode a Node ESM package or a `"type": "module"` app gets by default.

  Previously every relative specifier in the emitted declarations was extensionless, inherited
  verbatim from sources written for `moduleResolution: "bundler"`. Bundler resolution
  substitutes extensions; node16 does not, and it has no directory-index lookup either. The
  damage had two shapes, and only one of them was loud:
  - The `@comvi/plugin-fetch-loader` entry that carries `cdnLoader` was built as
    `export * from './cdn/index'`. A star re-export from an unresolved module contributes no
    names, so the entry point had **zero exported members**, and importing `cdnLoader` failed
    with `TS2305 ... has no exported member 'cdnLoader'`. `@comvi/core` and
    `@comvi/plugin-in-context-editor` had the same shape on `export type * from './types'` and
    `export * from './entry-production'`.
  - Every other entry used named re-exports (`export { X } from './options'`). Those keep the
    name but bind it to an unresolved module, so `X` silently became `any`. With the
    `skipLibCheck: true` nearly every app sets, a node16 consumer got **no diagnostic at
    all**: `createI18n(123)` type-checked. The packages looked typed and checked nothing.

  **On upgrade, a `node16`/`nodenext` project may see NEW type errors in its own code.** Those
  errors were always there — the types that would have reported them were `any`. Code written
  against the real signatures needs no change.

  Bundler-resolution consumers (Vite, and Next.js projects on the `bundler` default) were
  never affected — their types were correct throughout. Consumers on `node16`/`nodenext` get
  real types for the first time, with one exception outside our control: `@comvi/next`'s
  middleware and routing declarations import `next/server` and `next/link`, and `next@15.5.9`
  ships no `exports` field, so those subpaths still do not resolve under `node16` (3 ×
  TS2307 raised inside `@comvi/next`'s own declarations). Next.js projects on the `bundler`
  resolution its own tooling sets are unaffected.

  `pnpm check:types-exports` now gates attw's `node16` resolution mode in addition to
  `bundler`. attw detects this defect perfectly well — 10 × `InternalResolutionError` on
  `@comvi/plugin-fetch-loader` alone, `./cdn/index` among them. It was a single line in the
  repo's own wrapper that suppressed the entire node16 report, so the gate was green on a
  broken tree. The gate also grew a small probe for the one thing attw cannot reach: attw
  resolves entry points with a fixed condition set, so a `types` branch under a custom
  condition — `@comvi/plugin-in-context-editor`'s `"types": { "production": … }` — is never
  visited, and that is exactly where `export * from './entry-production'` was hiding.

  `@comvi/svelte` and `@comvi/nuxt` were previously excluded from that gate as "covered by
  publint". They were not: publint validates the manifest, not resolution inside a declaration
  file, and printed "All good!" on both broken trees. Every published package is now gated.

  Follow-up, deliberately NOT in this release: the declarations are corrected by a post-build
  rewrite (`tooling/qualify-dts-specifiers.mjs`) wired into each package's build. Writing the
  `.js` extension in the SOURCES instead is legal under `moduleResolution: "bundler"` and is
  emitted verbatim, which would let the rewriter be deleted and would cover `svelte-package`
  and `nuxt-module-build` without per-package wiring — one mechanical sweep over 566
  extensionless relative imports across 161 files. Neither `moduleResolution: node16` in the emitting
  tsconfig nor `rewriteRelativeImportExtensions` is a substitute.

- 09029b0: **Every runtime message opens with the name of the package whose code wrote it.** `[i18n]` and `[comvi]` become `[@comvi/core]` in core, `[@comvi/react]` and `[@comvi/vue]` in those bindings, and `[@comvi/next]` on next's `.use()` identity error; the in-context editor's `[ComviInContextEditor]`, `[InContextEditor]`, `[ElementHighlighter]` and `[comvi]` become `[@comvi/plugin-in-context-editor]`, and the CLI's `[comvi]` becomes `[@comvi/cli]`. A core message surfaced through a binding keeps `[@comvi/core]`. The sentence after the prefix is unchanged, except that a few messages that had no prefix gain one: core's plugin-initialization timeout and failure and its missing-tag-handler report, react's non-element tag handler error, the fetch loader's project-info, API, CDN HTTP and timeout errors, and the editor's console diagnostics. Core's `Locale is not set` and `` `messages` is not an object `` move from the `@comvi/core:` form to `[@comvi/core]`. Three catalog-level sentences now say messages, the catalog word: `No loader registered. Cannot reload messages.`, `Failed to reload messages` (core) and `Failed to refresh messages from the API.` (editor). Production error codes such as `E_ICU_SYNTAX` are unchanged.
- 09029b0: The two packages 0.5 extracted so that shared code has one copy — locale routing (next, nuxt) and the declaration emitter (cli, vite-plugin) — stay internal to the repository instead of being published. Each of these four packages now carries the shared implementation inside its own build, so **none of them gained a runtime dependency**: next bundles the routing primitives, nuxt ships them vendored into its runtime, and cli and vite-plugin bundle the emitter along with its declarations, so their published `.d.ts` still declare `SchemaParam`, `KeySchema` and `ProjectSchema` themselves. Nothing about the four packages' APIs changes and nothing extra is installed; the release train is 12 packages on one version.
- 09029b0: Generated types now augment the Comvi package your app declares, so a one-package install gets working keys. The declaration used to augment `@comvi/core` unconditionally, but the documented install adds only a framework binding and core arrives through it as a transitive dependency — under pnpm's strict layout or Yarn PnP the app cannot resolve it, the augmentation attached to nothing, TypeScript reported TS2882 on the generated import, and `skipLibCheck: true` hid that while every unknown key type-checked.

  The target is read from your `package.json`: `@comvi/core` when you declare it, otherwise `@comvi/react`, `@comvi/next`, `@comvi/vue`, `@comvi/nuxt`, `@comvi/svelte` or `@comvi/solid`. The generated header names it. Nothing extra to install, and nothing is resolved from `node_modules`, so the answer is the same on every machine and `comvi typegen --check` regenerates the same file the write path produced. Declare none of them and both tools refuse instead of writing an inert file. Set `augment` in `.comvirc.json`, or the `augment` plugin option, to name another module such as a private wrapper package that re-exports a binding.

  The rule reads the `dependencies` and `devDependencies` of that one `package.json`. Declaring the package in a workspace root or under `peerDependencies` is not enough: the app's own manifest must list it, or `augment` must name the module. If your app relied on a hoisted copy it never declared, generation now fails until you add it — which is the dependency you were already importing.

  Regenerate once after upgrading: the header line changed and `--check` compares it.

- 09029b0: Generated declaration files now carry one tool-neutral header, so `comvi typegen --check` no longer reports drift on a file the Vite plugin wrote. The two tools each stamped their own name on header line 3, and the check compares the file on disk against fresh output literally — a project generating types with the plugin in dev and checking them with the CLI in CI failed the check on every run, with no regeneration able to clear it. The header line is now dropped from both sides of the comparison in every wording that has shipped, so it can never be the reason for a stale verdict again.

  Regenerate once after upgrading and commit the result: a file written by 0.4 still compares as outdated, because 0.5 quotes keys and parameter names with `JSON.stringify` where 0.4 emitted single quotes and bare names, and the comparison does not normalize quoting.

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
