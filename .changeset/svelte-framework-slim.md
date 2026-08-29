---
"@comvi/svelte": minor
---

**BREAKING (0.5.0 — a 0.x minor, WATCHDOG policy):** `@comvi/svelte` now runs on a base `@comvi/core` host, and the four loader/plugin members left `useI18n()` for two dedicated context readers (framework-slim P3, same D′ contract as `@comvi/react`).

This is the binding where the old contract did not merely mistype the host — it **crashed** on one. `useI18n()` eagerly `.bind()`-ed `addActiveNamespace`, `reloadTranslations`, `onLoadError` and `onMissingKey` in the object literal it returned, so on a host without those capabilities it threw `Cannot read properties of undefined (reading 'bind')` before a single translation rendered.

### Migration

| 0.4.x                                                                       | 0.5.0                                                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `const { addActiveNamespace, reloadTranslations, onLoadError } = useI18n()` | `const { addActiveNamespace, addActiveNamespaces, reloadTranslations, onLoadError } = useI18nLoader()`                                                       |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()`                                                                                                                  |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `const { t } = useI18n("ns"); const { reloadTranslations } = useI18nLoader();` — the namespace argument stays on `useI18n`, the capability readers take none |

Codemod (checked in, goldens + idempotence gated in CI; it reads `.svelte` script blocks):

```
pnpm codemod:framework-slim "src/**/*.{ts,js,svelte}"
```

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items remain (each printed as `path:line [shape] detail`; `--report report.json` writes the same list as JSON). It handles pure, mixed, aliased and repeated destructures and merges into an existing capability destructure; it refuses — loudly, never silently — rest spreads, computed keys, hook results stored in a variable or crossing a function boundary, local-name collisions with the introduced readers, `.svelte` script blocks that fail extraction, and relative-import call sites it cannot retarget. It also rewrites the retired subpath specifier and the constructor options that became capabilities. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

### `useI18nLoader()` / `useI18nPlugins()` are readers, NOT stores

They call `getI18nContext()`, so — like `useI18n()` — they are callable during component initialisation only, and what they return is a plain object of bound functions. Do not `$`-prefix a member. The asymmetry with `createLocaleStore()` & friends is deliberate: a capability action is an imperative operation, not a value that changes over time.

The names keep the `use*` prefix the package already uses for `useI18n`, so one grep finds the same API across every comvi binding.

A host that lacks the capability fails at the acquisition call with a message naming the fix — in development **and** in production, never a silent no-op:

```
// dev
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
// prod
[comvi] missing loader capability — attach @comvi/core/loader
```

The bag is referentially stable per host instance, so two components sharing one context receive the same function references.

Troubleshooting: `addActiveNamespace is not a function` / `reloadTranslations is not a function` / `onLoadError is not a function` → `useI18nLoader()`. `onMissingKey is not a function` → `useI18nPlugins()`.

### Fixed: the published package was unimportable from webpack and Node ESM

`dist/*.js` re-exported its siblings with extensionless specifiers (`export … from "./context"`). `@comvi/svelte` is `"type": "module"`, so strict-ESM resolvers require a fully specified request: webpack failed with `Can't resolve './context'` and Node's own ESM loader would too. The source now carries the emitted `.js` extension. No public API changed.

### Types accept any host

`setI18nContext(i18n)`, `getI18nContext()` and all six store factories accept `WrapperI18nHost` (`I18nCoreInstance & I18nCoreExtraApi`) instead of the concrete `I18n` class. Every host satisfies it — the base `createI18n` (from `@comvi/svelte`, which re-exports core's own by name) and any `attachLoader`/`attachPlugins`/`.with(…)` composition of it. The store factories gained an optional `D` type parameter (inferred) because `WrapperI18nHost<D>` — unlike the old `I18n` class — is invariant in `D`.

### Measured

Whole comvi graph, min+gz, framework externalized, same commit (`pnpm size`):

| app shape                               | before      | after    |
| --------------------------------------- | ----------- | -------- |
| svelte + 0.4 composed root, no `<T>`    | 10006       | **9949** |
| svelte + 0.4 composed root, with `<T>`  | 11389       | 11330    |
| svelte + bare `@comvi/core`, no `<T>`   | — (crashed) | **6972** |
| svelte + bare `@comvi/core`, with `<T>` | — (crashed) | 9180     |

**At that framework-slim checkpoint, moving a svelte app off the 0.4 composed root onto the base host saved 2977 B min+gz (−29.9%).** The then-current bare-host row asserted the tag-registration pair absent; its `<T>` row had no such sentinel, because `<T>` still imported the ambient tags entry at that checkpoint. Core's base entry is in every one of those graphs by construction — `createI18n` is its export — so no fixture asserted it away. The convergence measurement below supersedes those graphs.

Those four numbers were measured at the framework-slim P3 commit, when the base host lived on a core subpath the app named directly. Svelte convergence then collapsed the two specifiers and removed `<T>`'s ambient tag-registration import. The live rows are now `fw-svelte-default`, `fw-svelte-default-t`, `fw-svelte-icu` and `fw-svelte-full-composite`, all measured through the one published specifier; `svelte-default` absorbed the old `svelte-on-slim` case, and because `<T>` reaches the pure rich-text seam every row now asserts the ambient tag pair absent. Their byte budgets landed with the 0.5.0 re-baseline sweep at the usual measured + 2%, over measurements of 6412, 8603, 7298 and 11266 B min+gz.

> Rewritten in place at the single-entry convergence and at the svelte convergence
> that followed it (same release), which is why the file name still says `slim`:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host — so every specifier above
> names the root, and every "the root has it already" claim reads against the
> base host. Svelte then converged the same way: it publishes its root and
> nothing beside it, and the subpath this file was originally about is gone. The
> 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` and `svelte-single-entry-convergence.md` for
> the breaks and the migrations.
