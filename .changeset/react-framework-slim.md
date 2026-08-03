---
"@comvi/react": minor
---

**BREAKING (0.5.0):** `@comvi/react` now runs on a base `@comvi/core` host, and the four loader/plugin members left `useI18n()` for two dedicated hooks (framework-slim P2 — the reference implementation of the plan's D′ contract).

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

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items remain (each printed as `path:line [shape] detail`; `--report report.json` writes the same list as JSON). It handles pure, mixed, aliased and repeated destructures, merges into an existing capability destructure, and refuses — loudly, never silently — rest spreads, computed keys, stored hook results and local-name collisions. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

### Why the members moved

`useI18n()` used to bind them eagerly, so the hook could not run at all on a host without the loader/plugin capability, and its return type promised methods that a slim host does not have. They are now acquired explicitly, and a host that lacks the capability fails at that one call with a message naming the fix — in development **and** in production, never a silent no-op:

```
// dev
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
// prod
[comvi] missing loader capability — attach @comvi/core/loader
```

`useI18nLoader()` / `useI18nPlugins()` return a bag that is referentially stable per host instance — two components under one `<I18nProvider>` receive the same function references, and they survive re-renders. `useI18n()`'s remaining bag keeps its existing `useMemo([i18n])` semantics.

Troubleshooting: `addActiveNamespace is not a function` / `reloadTranslations is not a function` / `onLoadError is not a function` → `useI18nLoader()`. `onMissingKey is not a function` → `useI18nPlugins()`.

### `<T>` is opt-in, and so is the tag machinery

`<T>` ships as its own module (`dist/chunks/comvi-react-T.js`) with a `/*@__PURE__*/` memo wrapper. Previously the single-file bundle carried a top-level `import { prepareTranslation } from "@comvi/core/tags"` and a non-pure `React.memo(...)` call, so **every** app that imported anything from `@comvi/react` shipped `<T>` and core's side-effectful tag-registration chunk. Now an app that never imports `T` drops both. The import path is unchanged: `import { T } from "@comvi/react"`.

### Types accept any host

`I18nProviderProps.i18n` and both context value types accept `WrapperI18nHost` (`I18nCoreInstance & I18nCoreExtraApi`) instead of the concrete `I18n` class. Every host satisfies it — the base `createI18n` from `@comvi/core` and any `attachLoader`/`attachPlugins`/`.with(…)` composition of it.

### Measured

Whole comvi graph, min+gz, framework externalized, same commit (`pnpm size`):

| app shape                              | before         | after     |
| -------------------------------------- | -------------- | --------- |
| react + 0.4 composed root, no `<T>`    | 11278          | **10170** |
| react + 0.4 composed root, with `<T>`  | 11285          | 11220     |
| react + bare `@comvi/core`, no `<T>`   | — (impossible) | **7194**  |
| react + bare `@comvi/core`, with `<T>` | —              | 9076      |

**Moving a react app off the 0.4 composed root onto the base host saves 2976 B min+gz (−29.3%).** Staying on that composed root and never rendering `<T>`, together with core's own golf pass, saves 1108 B on its own. The bare-host fixture asserts — through the bundler's module graph, not an output-text grep — that core's tag-registration pair (`comvi-core-tags.js` plus its `register-tags` chunk) never enters the graph; the `<T>` row declares no such sentinel, because rendering `<T>` is exactly what buys that pair. Core's base entry is in both graphs by construction — `createI18n` is its export — so no fixture asserts it away. The `react-on-slim` case is green on webpack and vite in both development and production.

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
