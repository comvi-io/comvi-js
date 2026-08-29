---
"@comvi/solid": minor
---

**BREAKING (0.5.0 — a 0.x minor, WATCHDOG policy):** `@comvi/solid` now runs on a base `@comvi/core` host, and the four loader/plugin members left `useI18n()` for two dedicated accessors (framework-slim P3, same D′ contract as `@comvi/react`).

### Migration

| 0.4.x                                                                       | 0.5.0                                                                                                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `const { addActiveNamespace, reloadTranslations, onLoadError } = useI18n()` | `const { addActiveNamespace, addActiveNamespaces, reloadTranslations, onLoadError } = useI18nLoader()`                                                     |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()`                                                                                                                |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `const { t } = useI18n("ns"); const { reloadTranslations } = useI18nLoader();` — the namespace argument stays on `useI18n`, the capability hooks take none |

Codemod (checked in, goldens + idempotence gated in CI):

```
pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"
```

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items remain (each printed as `path:line [shape] detail`; `--report report.json` writes the same list as JSON). It handles pure, mixed, aliased and repeated destructures and merges into an existing capability destructure; it refuses — loudly, never silently — rest spreads, computed keys, hook results stored in a variable or crossing a function boundary, local-name collisions with the introduced accessors, and relative-import call sites it cannot retarget. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

### Why the members moved

`useI18n()` used to close over them, so its return type promised methods a slim host does not have and calling one produced a bare `undefined is not a function` at an arbitrary call site. They are now acquired explicitly, and a host that lacks the capability fails at that one call with a message naming the fix — in development **and** in production, never a silent no-op:

```
// dev
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
// prod
[comvi] missing loader capability — attach @comvi/core/loader
```

`useI18nLoader()` / `useI18nPlugins()` are plain accessors — **no signals**: a capability action is an imperative operation, not a reactive value. The bag they return is referentially stable per host instance, so two components under one `<I18nProvider>` receive the same function references.

Troubleshooting: `addActiveNamespace is not a function` / `reloadTranslations is not a function` / `onLoadError is not a function` → `useI18nLoader()`. `onMissingKey is not a function` → `useI18nPlugins()`.

### `<T>` is opt-in, and so is the tag machinery

`<T>` ships as its own module (`dist/chunks/comvi-solid-T.js`). At the
framework-slim checkpoint the single-file bundle carried a top-level
`import { prepareTranslation } from "@comvi/core/tags"`, so **every** app that
imported anything from `@comvi/solid` pulled in core's side-effectful
tag-registration chunk; the split fixed that for apps that never render `<T>`.
Convergence then moved the import itself onto the pure `@comvi/core/rich-text`
seam, so an app that DOES render `<T>` loads the grammar per call without
loading or executing tag registration either. The import path is unchanged:
`import { T } from "@comvi/solid"`.

### Types accept any host

`I18nProviderProps.i18n`, `I18nContextValue.i18n`, `useI18nContext()`'s return and all six reactive primitives (`createLocaleSignal` and friends) accept `WrapperI18nHost` (`I18nCoreInstance & I18nCoreExtraApi`) instead of the concrete `I18n` class. Every host satisfies it — the base `createI18n` (from `@comvi/solid`, which re-exports core's own by name) and any `attachLoader`/`attachPlugins`/`.with(…)` composition of it.

### Measured

Whole comvi graph, min+gz, framework externalized, same commit (`pnpm size`):

| app shape                              | before         | after    |
| -------------------------------------- | -------------- | -------- |
| solid + 0.4 composed root, no `<T>`    | 9992           | **9889** |
| solid + 0.4 composed root, with `<T>`  | 10879          | 10835    |
| solid + bare `@comvi/core`, no `<T>`   | — (impossible) | **6895** |
| solid + bare `@comvi/core`, with `<T>` | —              | 8710     |

**At that framework-slim checkpoint, moving a solid app off the 0.4 composed root onto the base host saved 2994 B min+gz (−30.3%).** The then-current bare-host row asserted — through the bundler's module graph, not an output-text grep — that core's tag-registration pair (`comvi-core-tags.js` plus its `register-tags` chunk) never entered it; its `<T>` row declared no such sentinel, because rendering `<T>` was exactly what bought that pair at the time. The convergence measurement below supersedes those graphs.

Those four numbers were measured at the framework-slim P3 commit, when the base host lived on a core subpath the app named directly. Solid convergence then collapsed the two specifiers and removed `<T>`'s ambient tag-registration import. The live ladder is now `fw-solid-default` (base), `fw-solid-default-t` (base + `<T>`), `fw-solid-icu` (inline ICU) and `fw-solid-full-composite` (full explicit composition); all four gate their sentinels today and carry byte budgets — measured + 2% — from the 0.5.0 re-baseline sweep, over measurements of 6336, 8131, 7222 and 10791 B min+gz. `solid-default` absorbed the old `solid-on-slim` matrix case; `<T>` reaches the pure rich-text seam, so every row now asserts the ambient tag pair absent.

> Rewritten in place at the single-entry convergence and at the solid convergence
> that followed it (same release), which is why the file name still says `slim`:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host — so every specifier above
> names the root, and every "the root has it already" claim reads against the
> base host. Solid then converged the same way: it publishes its root and
> nothing beside it, and the subpath this file was originally about is gone. The
> 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` and `solid-single-entry-convergence.md` for
> the breaks and the migrations.
