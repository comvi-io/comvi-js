---
"@comvi/vue": minor
---

**Added: the `@comvi/vue` root carries the whole toolkit.** Building an app used to take two packages: the host constructor from `@comvi/core`, the bindings from `@comvi/vue`. The root now carries both — all three construction paths included — so an app names one package and nothing else.

```ts
// one call: a VueI18n over a base @comvi/core host
import { createI18n } from "@comvi/vue";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
createApp(App).use(i18n).mount("#app");
```

```ts
// composed host: `createCore` IS core's constructor, same package
import { createCore, createI18nFromCore, loader } from "@comvi/vue";

const host = createCore({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
host.registerLoader(myLoader);
const i18n = createI18nFromCore(host, { ssrLocale: "en" }); // i18n.core is exactly `host`
```

### What is on it

| export                                            | what it is                                                    |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `createI18n`                                      | the one-call preset — a `VueI18n` over a base host            |
| `createCore`                                      | core's own constructor, for the composed path                 |
| `createI18nFromCore`                              | unchanged — wraps a host you built, preserving its exact type |
| `I18n`                                            | the base class `createCore` instantiates                      |
| `icuCompiler`, `icu`                              | from `@comvi/core/icu` — the compiler and the installer       |
| `loader`, `attachLoader`, `flattenCatalog`        | from `@comvi/core/loader`                                     |
| `plugins`, `attachPlugins`                        | from `@comvi/core/plugins`                                    |
| `devtools`, `attachDevtools`                      | from `@comvi/core/devtools`                                   |
| `VueI18n`, the composables, `<T>`, the inject key | unchanged                                                     |

Vue is the one binding whose preset is a real function — there is a `VueI18n` to construct, and `ssrLocale` has to reach the host before the reactive ref is seeded — so `createI18n` here is vue's own factory and core's constructor keeps a name of its own. `createI18n` takes the same option shape it always did, `ssrLocale` and `compiler` included, and returns `VueI18n<D, I18n<D>>` over the BASE `I18n`, so `i18n.core` is typed without the capabilities it does not have; the eight dropped proxies stay dropped. Both halves of ICU are here on purpose: `icuCompiler` is what an inline catalog takes as `createI18n({ compiler })`, and `icu()` is the installer a remote catalog needs **before** ingestion, so neither recipe makes a vue app reach for a core subpath. Attaching a capability is not configuring it: `attachLoader(host)` installs the API, `host.registerLoader(fn)` still gives it something to load.

### Composing a capability: `.with(installer)`

The same release puts a composition pipe on every core host — `host.with(f)` **is** `f(host)` — and ships configured installers for the three capabilities. The root re-exports them, so composition stays inside the one import. On vue the pipe goes on the HOST, one level below the wrapper:

```ts
const i18n = createI18n({ locale: "en" });
i18n.core.with(loader({ uk: () => import("./uk.json") }));
```

`loader(map)` attaches the loader capability **and** registers the map. `plugins()` and `devtools(options)` are the same shape. The `attach*` functions stay as the low-level API and are installers themselves — `.with(attachLoader)` is the form to use for a plain `LoaderFn`, because it keeps the import-map adapter out of your bundle.

Published plugin packages ship a lowercase `.with(…)` installer each in this same release — `fetchLoader`, `localeDetector` and `inContextEditor` — which composes the capabilities its plugin needs and then routes into `use`. The uppercase plugin factories are unchanged: compose the host yourself, then `use` them on it.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings (`vue.attachLoader === attachLoader`), from core's PURE subpaths only — never `export *`, which webpack development cannot prune, and never through another wrapper, which it cannot reconnect either. That star re-export is exactly what this entry used to carry, and dropping it is half of what the convergence bought. Three bundler-matrix cases hold the line, on webpack **and** vite, in development **and** production: `vue-default` calls no capability at all and asserts that the icu, loader, plugins and devtools subpath entries never enter its module graph; `vue-icu` calls `icuCompiler`, formats a real plural from the built bundle, and asserts the other three absent; `vue-composed` builds a host with `createCore(...).with(loader(map))`, wraps it with `createI18nFromCore`, and asserts the three it does not call absent while the one it does call works.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently. `<T>` instead uses the pure `@comvi/core/rich-text` seam in its own dist chunk, so rendering rich text never changes string-API tag behavior.

### Measured

Whole-app comvi graph, min+gz, `vue` externalized (`node scripts/size-check.mjs`). Five converged-entry fixtures are live. Four of them gate on module-graph sentinels from the first run and carry measured +2% byte budgets recorded at the 0.5.0 re-baseline sweep; the fifth is informational by design and is described below the table:

| size fixture              | app shape                                | min+gz      |
| ------------------------- | ---------------------------------------- | ----------- |
| `fw-vue-default`          | base host, one call, no `<T>`            | **6966 B**  |
| `fw-vue-default-composed` | base host, injected, no `<T>` — INFO row | —           |
| `fw-vue-default-t`        | base host, one call + `<T>`              | **8812 B**  |
| `fw-vue-icu`              | base host + inline ICU                   | **7848 B**  |
| `fw-vue-full-composite`   | full explicit composition + `<T>`        | **11435 B** |

`fw-vue-default-composed` is informational on purpose: read against `fw-vue-default`, its delta is the whole `VueI18n` construction path — the preset glue no other binding pays. Before the entries converged that delta was **5 B** (6880 for the one-call recipe against 6875 for hand-composing).

A size sentinel can only assert a module **absent**, so ICU's presence is the one claim no row above can make. The `vue-icu` bundler-matrix case makes it positively instead, by formatting a real plural from the built bundle.

### One entry, one injection key

The package publishes exactly one entry, so there is one build pass and one `Symbol("i18n")`: a plugin installed with `app.use(i18n)` and a `useI18n()` in the same app always see each other, and no import path can put a second copy of the bindings in your graph.

Nothing else is removed and no 0.4.x import path changes. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.

> Rewritten in place at the single-entry convergence and at the vue convergence
> that followed it (same release), which is why the file name still says `slim`:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host — so every specifier above
> names the root, and every "the root has it already" claim reads against the
> base host. Vue then converged the same way: it publishes its root and nothing
> beside it, and the subpath this file was originally about is gone. The 0.4
> composed root survives only as a recipe (`.with(loader())`, `.with(plugins())`,
> `.with(devtools())`, `compiler: icuCompiler` from `@comvi/core/icu`,
> `import "@comvi/core/tags"`); see `core-single-entry-convergence.md` and
> `vue-single-entry-convergence.md` for the breaks and the migrations.
