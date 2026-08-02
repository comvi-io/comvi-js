---
"@comvi/solid": minor
---

**BREAKING (0.5.0):** `@comvi/solid` now runs on a bare `@comvi/core/slim` host, and the four loader/plugin members left `useI18n()` for two dedicated accessors (framework-slim P3, same D′ contract as `@comvi/react`).

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

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items remain.

### Why the members moved

`useI18n()` used to close over them, so its return type promised methods a slim host does not have and calling one produced a bare `undefined is not a function` at an arbitrary call site. They are now acquired explicitly, and a host that lacks the capability fails at that one call with a message naming the fix — in development **and** in production, never a silent no-op:

```
// dev
[comvi] This i18n instance has no loader capability. Attach it: import { attachLoader } from "@comvi/core/loader" — or use the root "@comvi/core" entry.
// prod
[comvi] missing loader capability — attach @comvi/core/loader
```

`useI18nLoader()` / `useI18nPlugins()` are plain accessors — **no signals**: a capability action is an imperative operation, not a reactive value. The bag they return is referentially stable per host instance, so two components under one `<I18nProvider>` receive the same function references.

Troubleshooting: `addActiveNamespace is not a function` / `reloadTranslations is not a function` / `onLoadError is not a function` → `useI18nLoader()`. `onMissingKey is not a function` → `useI18nPlugins()`.

### `<T>` is opt-in, and so is the tag machinery

`<T>` ships as its own module (`dist/chunks/comvi-solid-T.js`). Previously the single-file bundle carried a top-level `import { prepareTranslation } from "@comvi/core/tags"`, so **every** app that imported anything from `@comvi/solid` pulled in core's side-effectful tag-registration chunk. Now an app that never imports `T` drops it. The import path is unchanged: `import { T } from "@comvi/solid"`.

### Types accept any host

`I18nProviderProps.i18n`, `I18nContextValue.i18n`, `useI18nContext()`'s return and all six reactive primitives (`createLocaleSignal` and friends) accept `WrapperI18nHost` (`I18nCoreInstance & I18nCoreExtraApi`) instead of the concrete root `I18n` class. Root instances still satisfy it, so `createI18n` from `@comvi/core` keeps working unchanged; `createI18n` from `@comvi/core/slim` and any `attachLoader`/`attachPlugins` composition now work too.

### Measured

Whole comvi graph, min+gz, framework externalized, same commit (`pnpm size`):

| app shape                                   | before         | after    |
| ------------------------------------------- | -------------- | -------- |
| solid + root core, no `<T>`                 | 9992           | **9953** |
| solid + root core, with `<T>`               | 10879          | 10906    |
| solid + bare `@comvi/core/slim`, no `<T>`   | — (impossible) | **6978** |
| solid + bare `@comvi/core/slim`, with `<T>` | —              | 8785     |

**Moving a solid app from the root entry to bare slim saves 2975 B min+gz (−29.9%).** Both slim fixtures assert — through the bundler's module graph, not an output-text grep — that `comvi-core.js` and core's tag chunks are absent, and the `solid-on-slim` case is green on webpack and vite in both development and production.
