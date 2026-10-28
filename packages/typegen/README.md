<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">typegen (internal)</h1>

<p align="center">The one generator of typed translations: <code>generate()</code> and <code>watch()</code>, which every wrapper calls.</p>

---

> **Workspace-private.** `"private": true`, and in the `ignore` list of
> `.changeset/config.json`. Each wrapper inlines this package at build time
> (`bundledPackages: ["@comvi/typegen"]` for its declarations), so nothing published names it.

## Who calls it

| Wrapper                                                                   | Calls                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `comvi typegen` (`@comvi/cli`)                                            | `generate()`, `--check` → `generate({ check: true })`, `watch()` |
| `comvi pull` (`@comvi/cli`)                                               | `PlatformSource` + `serializeWireSchema` → `.comvi/schema.json`  |
| `comviTypes()` (`@comvi/vite-plugin`)                                     | `vite build` → `generate()`; `vite dev` → `watch()`              |
| `withComvi({ types })` (`@comvi/next`, lot 6) and the Nuxt module (lot 7) | the same two                                                     |

One emitter behind all of them, so the same catalogs give the same bytes whichever wrapper ran
(`scripts/typegen-e2e` compares them).

## `generate(options)`

```ts
import { generate } from "@comvi/typegen";

const result = await generate({ from: "./locales", out: "./comvi.d.ts", sourceLocale: "en" });
// { content, written, stale, namespaces, keys, warnings }
```

| Option          | Meaning                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`          | A directory of JSON catalogs, a wire schema v2 file (`.comvi/schema.json`), or `{ platform: { apiKey?, apiBaseUrl?, fetch? } }` (key from `COMVI_API_KEY`). |
| `out`           | The declaration file. Relative paths resolve against `root`.                                                                                                |
| `root`          | The app's root (default `process.cwd()`); its `package.json` names the module to augment.                                                                   |
| `sourceLocale`  | Directory source: the locale the types come from. Required with more than one locale.                                                                       |
| `fileTemplate`  | Directory source: default `{namespace}/{languageTag}.json`, where `<locale>.json` is `default`.                                                             |
| `augment`       | The module to augment; by default the Comvi package `package.json` declares.                                                                                |
| `defaultParams` | The keys of `createI18n({ defaultParams })`: optional in every key's params.                                                                                |
| `check`         | Write nothing; `stale` says whether the file on disk differs (CI: fail on `stale`).                                                                         |
| `onMessage`     | `({ level, text }) => void` for warnings; by default each distinct line is printed once.                                                                    |

It throws, and leaves the file on disk as it was, for: broken JSON (`CatalogFileError`, naming
the file), a param named `ns`, `locale` or `markers` (`EmitError`, listing every key), an
unreachable or refusing platform (`PlatformError`, with `status`), a missing directory or
`sourceLocale`, an app that declares no Comvi package, and a declaration file that exists but
cannot be read. Writes are atomic (temporary file + rename) and skipped when the content is
unchanged.

## `watch(options)`

```ts
import { watch } from "@comvi/typegen";

const watcher = watch({ from: "./locales", out: "./comvi.d.ts", sourceLocale: "en" });
await watcher.ready; // the first generation ran (or was reported)
// … watcher.close() when the dev server stops
```

The options of `generate()` without `check`, plus `debounceMs` (default 100) and `onFatal`
(the platform refused the key; the watcher has stopped). It never throws after start: a failed
run is reported through `onMessage` once per broken state, and the file stays as it was.

- **A directory** is watched recursively; a burst of saves is one run; only the namespaces
  whose files changed are read again, and only files whose text changed are parsed
  (`watcher.stats` counts runs, files read, files parsed and writes). For a few seconds after
  the first run the files are also compared by stat, so a save made while the OS watcher was
  still starting (macOS) is not lost.
- **A schema file** is watched by name in its directory (`comvi pull` replaces it); the
  directory is created when missing.
- **The platform**: the first fetch does not wait for the stream, so `ready` settles even when
  the platform is down. The v1 SSE stream (`/schema/stream`) is the change signal and v2 is
  fetched on each event, the one on (re)connect included; the stream reconnects with growing
  waits and is replaced after 45 s of silence. A refused key (401/403) stops it via `onFatal`.
- **One writer per declaration file.** A lock in the OS temp directory: a second `watch()` of
  the same `out`, in this process (a reloaded config) or another (a second dev server, a
  framework worker), stays idle (`watcher.active === false`) and takes over when the first
  closes (at once in-process) or its process dies (within a second).

## For the Next and Nuxt wrappers (lots 6 and 7)

- Development: `watch()` once per process; keep the `Watcher` on `globalThis` so a reloaded
  config reuses it instead of opening another, and `close()` it when the server stops.
- Production build: `await generate()` once; `types: { check: true }` → `generate({ check: true })`
  and fail the build on `stale`.
- Both run where the config is loaded, not in the bundler, so webpack and Turbopack get the same.

## The pieces

- `parseWireSchema` / `serializeWireSchema`: the wire schema v2 (`{ v: 2, sourceLocale,
namespaces }`), validated strictly and serialized canonically.
- `readMessage`: a message's params, tags and choices, read by `@comvi/core`'s own scanner (its
  development-only shape observer), so the types follow the grammar that renders the message.
- `buildWireKey`: one key from all locales, the platform's source-locale rule.
- `emitCatalogs(schema, { augment, defaultParams })`: the declaration, `interface Catalogs` of the
  augmented module, one member per namespace, params by key, nothing repeated per locale.
- `LocalSource`, `PlatformSource`, `resolveAugmentationTarget`, `writeIfChanged`, `lockFileOf`.

`pnpm --filter @comvi/typegen test` pins the reader, the emitter and the Node API (counted work,
no timing); `pnpm typegen:e2e` runs the built wrappers; `pnpm check:types-bench` and
`pnpm check:types-ide` measure the emitted types in `tsc` and in `tsserver`.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
