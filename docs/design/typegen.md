# One generator for typed translations

**Status:** accepted, 28.10.2026 (0.8, lot 3: design rev 3 R3-18, R3-19).

## Context

0.7 generated `TranslationKeys` in two places: `@comvi/cli` from the platform's v1 schema, and
`@comvi/vite-plugin` from local JSON with its own ICU reader (`message-shape.ts`). The two were
kept in step by a shared emitter and parity tests, yet each had its own writer, its own watch loop
and its own reading of a message, and an app without Vite (Next first of all) had no offline
generation at all. Developers turn typed translations off when the editor lags or when the
generated file churns, so the generator also has to be stable: no half-written file, no rewrite
loop in a dev server, one message for a broken catalog.

## Decision

- **One input:** the wire schema v2 (`{ v: 2, sourceLocale, namespaces }`). The platform route
  `GET /v1/projects/:id/schema/v2`, a local directory of JSON catalogs and `.comvi/schema.json`
  (written by `comvi pull`) all become it; `sourceLocale` decides options and tags.
- **One reader:** a message is read by `@comvi/core`'s own scanner through its development-only
  shape observer. The types and the rendered text cannot disagree about a message; `comvi check`
  reads with it too.
- **One emitter:** `interface Catalogs` of the module the app declares, one member per namespace,
  each key's params directly (no `{ params }` wrapper), nothing per locale, flat string keys.
- **One Node API:** `generate()` and `watch()` in the workspace-private `@comvi/typegen`. The CLI,
  the Vite plugin, and the Next and Nuxt wrappers only choose when to call which; each inlines
  the package, so the bytes are the same whichever wrapper wrote the file.
- **One writer per declaration file:** writes are atomic (temporary file + rename) and skipped when
  the content is unchanged; a lock in the OS temp directory lets one `watch()` write a file while a
  second one (a reloaded config, a second dev server, a framework worker) waits and takes over.
- **Watching the platform** reuses the v1 SSE stream as the change signal and fetches v2 on each
  event: no platform endpoint of its own.

## Consequences

- Every gate counts work, never milliseconds: files parsed per change, runs per burst, writes per
  change, `tsserver` instantiations per editor operation (`scripts/types-bench/ide.mjs`).
- A message core refuses (`{x, number}`, a select without `other`, an unclosed tag) is reported by
  the generator and by `comvi check` as core reports it; params after the failure point are
  unknown, and the platform's extractor, which reads on, can differ there.
- Catalogs are flat: a nested object is reported and left out, as the runtime leaves it out.
- `"ns:key"` keys, `strictParams` and the 0.7 extractor are gone; `defaultParams` replaces the one
  real use of optional params.

## Alternatives rejected

- **Generation inside the bundler** (a webpack and a Turbopack plugin for Next): two
  implementations to keep equal. Generating where the config is loaded is the same under both.
- **A lock file beside the declaration:** it shows up in the app's tree and in `git status`.
- **A second ICU reader kept in step by tests:** it has to change with every grammar change, and
  0.8 changed several (`=1e3` exact selectors are valid; an unclosed tag is an error, not text).

## Where it lives

`packages/typegen/src/v2/` (`generate`, `watch`, `lockFileOf`, `readMessage`, `emitCatalogs`,
`LocalSource`, `PlatformSource`, `parseWireSchema`); `@comvi/cli` `createTypegenCommand`,
`platformSource`, `toCliError`, `CatalogCheck`; `@comvi/vite-plugin` `comviTypes`;
`scripts/typegen-e2e/run.test.mjs`; `packages/cli/e2e/typegen-v2.e2e.test.ts`.
