---
"@comvi/vue": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/vue` now builds the base host.** Vue's `createI18n` is a real preset — it constructs a `VueI18n` around a `@comvi/core` host and applies `ssrLocale` before the reactive ref is seeded — and in 0.4 the host it constructed arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Core's convergence made that same class the base host, so a vue app that calls `createI18n` now gets those five as things it composes rather than things it already had. Read the table below before upgrading: ICU plurals THROW instead of rendering wrong text.

Nothing about the preset itself changes: same call signature, same `ssrLocale` handling, same `VueI18n`, same `app.use(i18n)` plugin install, same composables, same `<T>`, same `I18N_INJECTION_KEY`. `createCore` and `createI18nFromCore` are untouched escape hatches. This is the host underneath them.

The other half is packaging: `@comvi/vue` publishes exactly ONE entry, and that entry is the whole toolkit — all three constructors, the base `I18n` class, both ICU halves and the loader/plugin/devtools installers, all named re-exports (see `vue-single-package-slim.md`).

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/vue/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported, `createCore` included. It never published, so there is no deprecation debt.

### What a 0.4 vue app experiences

| 0.4 behaviour of vue's `createI18n`                   | after                       | loudness                                        | migration                                                                                                |
| ----------------------------------------------------- | --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ICU plurals, select, selectordinal                    | the default compiler throws | **dev AND prod throw** `E_ICU_SYNTAX`           | inline catalogs: `compiler: icuCompiler`; remote catalogs: `.with(icu())` on the core, BEFORE the loader |
| loader (`registerLoader`, `reloadTranslations`, …)    | absent until composed       | the loud capability error, at `useI18nLoader()` | `i18n.core.with(loader(map))`, or `.with(attachLoader)` for a plain `LoaderFn`                           |
| `.use(plugin)`, `onMissingKey`                        | absent until composed       | TS error + runtime `TypeError`                  | `i18n.core.with(plugins())`, then `i18n.core.use(p)`                                                     |
| devtools discovery (`instanceId`, `window.__COMVI__`) | absent                      | invisible to the browser extension (documented) | `i18n.core.with(devtools({ instanceId }))`                                                               |
| nested constructor catalogs                           | stored verbatim             | dev warning                                     | `flattenCatalog(…)`, or compose `loader()`                                                               |
| tag markup through `t()` (`"<b>hi</b>"`)              | literal text                | dev warning; prod literal, never a throw        | render `<T>`, or `import "@comvi/core/tags"` at your own entry                                           |
| `createI18n`, `createCore`, `createI18nFromCore`      | untouched call shapes       | —                                               | —                                                                                                        |
| `ssrLocale`, `VueI18n`, the composables, `<T>`        | untouched                   | —                                               | —                                                                                                        |

Every installer that table names is re-exported from `@comvi/vue`, so each migration stays inside the one import specifier you already have.

**Where the pipe goes on vue.** `createI18n` returns a `VueI18n`, not the host, so `.with(…)` lives one level down — on `i18n.core`, or on a host you build with `createCore` and hand to `createI18nFromCore`. That is the one shape that differs from react, solid and svelte, whose `createI18n` IS core's constructor.

### ICU has two shapes on this entry, and the wrong one throws

`icuCompiler` is a compiler and `icu()` is an installer, so which one you need depends on where the catalog comes from:

```ts
// INLINE — the preset ingests the catalog, so choose the compiler in the same call.
import { createI18n, icuCompiler } from "@comvi/vue";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });

// REMOTE — install on the core BEFORE anything is ingested.
import { createCore, createI18nFromCore, icu, loader } from "@comvi/vue";

const core = createCore({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
const i18n = createI18nFromCore(core, { ssrLocale: "en" });
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any catalog reaches the host — a constructor `translation`, an `addTranslations` call, or a loader merge — and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"` before mutating anything. So `createI18n({ translation }).core.with(icu())` is invalid by construction: pass `compiler: icuCompiler` there instead.

### The tag residual

`t("Click <b>here</b>")` returns that markup as text: no entry registers tag syntax ambiently, and `@comvi/core/tags` is deliberately not re-exported here. Development warns the first time, production stays literal and never throws — a literal `<b>` is visibly broken in review, unlike a plausible-looking plural. Render `<T>` (it now reaches the pure `@comvi/core/rich-text` seam and passes the tag extension per call, so it needs no ambient registration) or `import "@comvi/core/tags"` once at your own entry if you want tag interpolation through `t()` itself.

**`<T>` changed seams in this release.** It used to import `@comvi/core/tags`, the side-effectful subpath, which meant that rendering `<T>` anywhere in a vue app also switched tag syntax on for every plain `t()` call. It now imports the pure seam instead. Rich-text rendering is unchanged; what is gone is the accidental ambient switch, and with it a dev/prod divergence for any app whose production build pruned `<T>`.

### Measured

Five live size fixtures cover the converged entry: `fw-vue-default` (the one-call preset, no capability), `fw-vue-default-composed` (the same wrapper through `createCore` + `createI18nFromCore`), `fw-vue-default-t`, `fw-vue-icu` and `fw-vue-full-composite`. Four of them GATE: they assert ambient tag registration absent from the emitted module graph on every run, and the three below the composite also assert every unused capability module absent; their byte budgets are measured + 2%, recorded at the 0.5.0 re-baseline sweep over measurements of **6966 B** (`fw-vue-default`), **8812 B** (`fw-vue-default-t`), **7848 B** (`fw-vue-icu`) and **11435 B** (`fw-vue-full-composite`), as recorded in `scripts/size-budgets.json`. `fw-vue-default-composed` is deliberately informational — measured and printed, never gated — because it is a comparison row: the delta between it and `fw-vue-default` IS vue's preset glue, the `VueI18n` construction path no other binding pays for. Pre-convergence anchors, HISTORICAL, for comparison: the one-call recipe measured **6880 B** min+gz and hand-composing **6875 B** (a 5 B preset glue), `<T>` added **8847 B**, and the 0.4 composed root was **10363 B** without `<T>` and **11377 B** with it. The converged figures above are the ones `scripts/size-budgets.json` now records.

Three bundler-matrix cases exercise the published tarball on webpack and vite in development and production: `vue-default` calls no capability and asserts all four subpath entries out of the module graph, `vue-icu` formats a real plural from the built bundle and asserts the other three out, and `vue-composed` composes `createCore(...).with(loader(map))` through `createI18nFromCore` and asserts the three it does not call out.

See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4 for the vue walkthrough and `core-single-entry-convergence.md` for the core break this one rides on.
