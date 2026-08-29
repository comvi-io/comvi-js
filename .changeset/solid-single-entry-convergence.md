---
"@comvi/solid": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/solid` now builds the base host.** `@comvi/solid` has re-exported core's `createI18n` and `I18n` by name since 0.4, and in 0.4 that constructor arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Core's convergence made the same binding the base host, so a solid app that calls `createI18n` now gets those five as things it composes rather than things it already had. Read the table below before upgrading: ICU plurals THROW instead of rendering wrong text.

Nothing about `<I18nProvider>`, `useI18n()`, `<T>`, the reactive primitives or the capability accessors changes here. This is the host underneath them.

The other half is packaging: `@comvi/solid` publishes exactly ONE entry, and that entry is the whole toolkit — the constructor, the class, both ICU halves and the loader/plugin/devtools installers, all named re-exports (see `solid-single-package-slim.md`).

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/solid/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported. It never published, so there is no deprecation debt.

### What a 0.4 solid app experiences

| 0.4 behaviour of solid's `createI18n`                 | after                   | loudness                                                             | migration                                                                                   |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ICU plurals, select, selectordinal                    | not compiled by default | **dev throws; prod renders it literally and reports** `E_ICU_SYNTAX` | inline catalogs: `compiler: icuCompiler`; remote catalogs: `.with(icu())` BEFORE the loader |
| loader (`registerLoader`, `reloadTranslations`, …)    | absent until composed   | the loud capability error, at `useI18nLoader()`                      | `.with(loader(map))`, or `.with(attachLoader)` for a plain `LoaderFn`                       |
| `.use(plugin)`, `onMissingKey`                        | absent until composed   | TS error + runtime `TypeError`                                       | `.with(plugins())`, then `use(p)`                                                           |
| devtools discovery (`instanceId`, `window.__COMVI__`) | absent                  | invisible to the browser extension (documented)                      | `.with(devtools({ instanceId }))`                                                           |
| nested constructor catalogs                           | stored verbatim         | dev warning                                                          | `flattenCatalog(…)`, or compose `loader()`                                                  |
| tag markup through `t()` (`"<b>hi</b>"`)              | literal text            | dev warning; prod literal, never a throw                             | render `<T>`, or `import "@comvi/core/tags"` at your own entry                              |
| `<I18nProvider>`, every primitive, `<T>`              | untouched               | —                                                                    | —                                                                                           |
| `new I18n(options)`                                   | untouched, one argument | —                                                                    | —                                                                                           |

Every installer that table names is re-exported from `@comvi/solid`, so each migration stays inside the one import specifier you already have.

### ICU has two shapes on this entry, and the wrong one throws

`icuCompiler` is a compiler and `icu()` is an installer, so which one you need depends on where the catalog comes from:

```tsx
// INLINE — the constructor ingests the catalog, so choose the compiler in the same call.
import { createI18n, icuCompiler } from "@comvi/solid";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });

// REMOTE — install BEFORE anything is ingested.
import { createI18n, icu, loader } from "@comvi/solid";

const i18n = createI18n({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any catalog reaches the host — a constructor `translation`, an `addTranslations` call, or a loader merge — and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"` before mutating anything. So `createI18n({ translation }).with(icu())` is invalid by construction: pass `compiler: icuCompiler` there instead.

### The tag residual

`t("Click <b>here</b>")` returns that markup as text: no entry registers tag syntax ambiently, and `@comvi/core/tags` is deliberately not re-exported here. Development warns the first time, production stays literal and never throws — a literal `<b>` is visibly broken in review, unlike a plausible-looking plural. Render `<T>` (it passes the tag extension per call, so it needs no ambient registration) or `import "@comvi/core/tags"` once at your own entry if you want tag interpolation through `t()` itself.

### Measured

Four size fixtures gate the converged entry — `fw-solid-default`, `fw-solid-default-t`, `fw-solid-icu` and `fw-solid-full-composite`, all live in `scripts/size-budgets.json` with `solid-js` externalized. Every row asserts ambient tag registration absent from the emitted module graph, and the first three also assert every unused capability module absent; those sentinel gates run today. The re-baseline sweep has landed, so every row also carries a byte budget at the corpus convention of measured + 2%, over measurements of **6336 B** (`fw-solid-default`), **8131 B** (`fw-solid-default-t`), **7222 B** (`fw-solid-icu`) and **10791 B** (`fw-solid-full-composite`), as recorded in `scripts/size-budgets.json`. For scale, the pre-convergence single-package recipe measured 6236 B min+gz and its `<T>` sibling 8162 B, against 9773 B for the 0.4 composed-root shape (HISTORICAL, 2026-08-03). `<T>` uses the pure `@comvi/core/rich-text` seam, so importing or rendering it never changes string-API tag behavior. Two bundler-matrix cases exercise the published tarball on webpack and vite in development and production: `solid-default` calls no capability at all and asserts the four capability subpaths and the tag pair out of the graph, while `solid-icu` formats a real plural and asserts the other three out.

See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4 for the solid walkthrough and `core-single-entry-convergence.md` for the core break this one rides on.
