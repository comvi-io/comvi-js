---
"@comvi/svelte": minor
---

**BREAKING (0.5.0):** `@comvi/svelte` now runs on a bare `@comvi/core/slim` host, and the four loader/plugin members left `useI18n()` for two dedicated context readers (framework-slim P3, same D′ contract as `@comvi/react`).

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

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items remain (each printed as `path:line [shape] detail`; `--report report.json` writes the same list as JSON). It handles pure, mixed, aliased and repeated destructures and merges into an existing capability destructure; it refuses — loudly, never silently — rest spreads, computed keys, hook results stored in a variable or crossing a function boundary, local-name collisions with the introduced readers, `.svelte` script blocks that fail extraction, and relative-import call sites it cannot retarget. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

### `useI18nLoader()` / `useI18nPlugins()` are readers, NOT stores

They call `getI18nContext()`, so — like `useI18n()` — they are callable during component initialisation only, and what they return is a plain object of bound functions. Do not `$`-prefix a member. The asymmetry with `createLocaleStore()` & friends is deliberate: a capability action is an imperative operation, not a value that changes over time.

The names keep the `use*` prefix the package already uses for `useI18n`, so one grep finds the same API across every comvi binding.

A host that lacks the capability fails at the acquisition call with a message naming the fix — in development **and** in production, never a silent no-op:

```
// dev
[comvi] This i18n instance has no loader capability. Attach it: import { attachLoader } from "@comvi/core/loader" — or use the root "@comvi/core" entry.
// prod
[comvi] missing loader capability — attach @comvi/core/loader
```

The bag is referentially stable per host instance, so two components sharing one context receive the same function references.

Troubleshooting: `addActiveNamespace is not a function` / `reloadTranslations is not a function` / `onLoadError is not a function` → `useI18nLoader()`. `onMissingKey is not a function` → `useI18nPlugins()`.

### Fixed: the published package was unimportable from webpack and Node ESM

`dist/*.js` re-exported its siblings with extensionless specifiers (`export … from "./context"`). `@comvi/svelte` is `"type": "module"`, so strict-ESM resolvers require a fully specified request: webpack failed with `Can't resolve './context'` and Node's own ESM loader would too. The source now carries the emitted `.js` extension. No public API changed.

### Types accept any host

`setI18nContext(i18n)`, `getI18nContext()` and all six store factories accept `WrapperI18nHost` (`I18nCoreInstance & I18nCoreExtraApi`) instead of the concrete root `I18n` class. Root instances still satisfy it, so `createI18n` from `@comvi/core` keeps working unchanged; `createI18n` from `@comvi/core/slim` and any `attachLoader`/`attachPlugins` composition now work too. The store factories gained an optional `D` type parameter (inferred) because `WrapperI18nHost<D>` — unlike the old `I18n` class — is invariant in `D`.

### Measured

Whole comvi graph, min+gz, framework externalized, same commit (`pnpm size`):

| app shape                                    | before      | after    |
| -------------------------------------------- | ----------- | -------- |
| svelte + root core, no `<T>`                 | 10006       | **9949** |
| svelte + root core, with `<T>`               | 11389       | 11330    |
| svelte + bare `@comvi/core/slim`, no `<T>`   | — (crashed) | **6972** |
| svelte + bare `@comvi/core/slim`, with `<T>` | — (crashed) | 9180     |

**Moving a svelte app from the root entry to bare slim saves 2977 B min+gz (−29.9%).** Both slim fixtures assert — through the bundler's module graph, not an output-text grep — that `comvi-core.js` and core's tag chunks are absent, and the `svelte-on-slim` case is green on webpack and vite in both development and production.
