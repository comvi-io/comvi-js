---
"@comvi/vue": minor
---

**Added: a one-call `createI18n` on `@comvi/vue/slim`, and the capability toolkit beside it.** Building a slim vue app used to take two packages and two calls: the host constructor from `@comvi/core`, `createI18nFromCore` from `@comvi/vue/slim`. Both halves now live on one entry, and the one-call path is back.

```ts
// one call: a VueI18n over a bare @comvi/core host
import { createI18n } from "@comvi/vue/slim";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
createApp(App).use(i18n).mount("#app");
```

```ts
// composed host: `createCore` IS core's constructor, same package
import { createCore, createI18nFromCore, loader } from "@comvi/vue/slim";

const host = createCore({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
host.registerLoader(myLoader);
const i18n = createI18nFromCore(host, { ssrLocale: "en" }); // i18n.core is exactly `host`
```

### What is on the entry

| export                                            | what it is                                                    |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `createI18n`                                      | **new** — one-call preset, `VueI18n` over a base host         |
| `createCore`                                      | **new** — `@comvi/core`'s constructor, for the composed path  |
| `createI18nFromCore`                              | unchanged — wraps a host you built, preserving its exact type |
| `icuCompiler`                                     | from `@comvi/core/icu` — pass as `createI18n({ compiler })`   |
| `loader`, `attachLoader`, `flattenCatalog`        | from `@comvi/core/loader`                                     |
| `plugins`, `attachPlugins`                        | from `@comvi/core/plugins`                                    |
| `devtools`, `attachDevtools`                      | from `@comvi/core/devtools`                                   |
| `VueI18n`, the composables, `<T>`, the inject key | unchanged                                                     |

`createI18n` here takes `@comvi/vue`'s option shape — `ssrLocale` included, applied to the host before the reactive ref is seeded — plus `compiler`. It returns `VueI18n<D, I18n<D>>` over the **slim** `I18n`, so `i18n.core` is typed without the capabilities it does not have; the eight dropped proxies stay dropped. `createCore` is named after what it builds because `createI18n` is taken by the preset.

### Composing a capability: `.with(installer)`

The same release puts a composition pipe on every core host — `i18n.with(f)` **is** `f(i18n)` — and ships configured installers for the three capabilities. This entry re-exports them, so composition stays inside the one import:

```ts
const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
```

`loader(map)` attaches the loader capability **and** registers the map. `plugins()` and `devtools(options)` are the same shape. The `attach*` functions stay as the low-level API and are installers themselves — `.with(attachLoader)` is the form to use for a plain `LoaderFn`, because it keeps the import-map adapter out of your bundle.

Published plugin packages are unchanged: compose the host, then `use` them. That is the current recipe, not the final one — plugin packages will become directly `.with`-able in a follow-up.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings (`slim.attachLoader === attachLoader`), from core's PURE subpaths only — never `export *`, which is the very construct that forced `@comvi/vue/slim` into existence (webpack development cannot prune a star re-export). The bundler-matrix case `vue-slim-preset` asserts that the icu, plugins and devtools subpaths never enter an app's module graph — webpack **and** vite, development **and** production — while the capability the app does attach works.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently, and `<T>` already owns that import in its own dist chunk.

### Measured

Whole-app comvi graph, min+gz, `vue` externalized (`node scripts/size-check.mjs`): the one-call recipe is **6880 B** against **6875 B** for hand-composing — 5 B for the whole `VueI18n` construction path.

### Pick one entry per app

`@comvi/vue` and `@comvi/vue/slim` are separate build passes, so `I18N_INJECTION_KEY` is a different symbol in each — a plugin installed from one is invisible to a composable from the other. `/slim` is a superset of the bindings, so there is never a reason to mix.

Nothing is removed and no existing import path changes. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
