---
"@comvi/svelte": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/svelte` now builds the base host.** `@comvi/svelte` has re-exported core's `createI18n` and `I18n` by name since 0.4, and in 0.4 that constructor arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Core's convergence made the same binding the base host, so a svelte app that calls `createI18n` now gets those five as things it composes rather than things it already had. Read the table below before upgrading: ICU plurals THROW instead of rendering wrong text.

Nothing about `setI18nContext()`, `useI18n()`, `<T>`, the store factories or the capability readers changes here. This is the host underneath them.

The other half is packaging: `@comvi/svelte` publishes exactly ONE entry, and that entry is the whole toolkit — the constructor, the class, both ICU halves and the loader/plugin/devtools installers, all named re-exports (see `svelte-single-package-slim.md`).

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/svelte/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported. It never published, so there is no deprecation debt.

### What a 0.4 svelte app experiences

| 0.4 behaviour of svelte's `createI18n`                | after                   | loudness                                                             | migration                                                                                   |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ICU plurals, select, selectordinal                    | not compiled by default | **dev throws; prod renders it literally and reports** `E_ICU_SYNTAX` | inline catalogs: `compiler: icuCompiler`; remote catalogs: `.with(icu())` BEFORE the loader |
| loader (`registerLoader`, `reloadTranslations`, …)    | absent until composed   | the loud capability error, at `useI18nLoader()`                      | `.with(loader(map))`, or `.with(attachLoader)` for a plain `LoaderFn`                       |
| `.use(plugin)`, `onMissingKey`                        | absent until composed   | TS error + runtime `TypeError`                                       | `.with(plugins())`, then `use(p)`                                                           |
| devtools discovery (`instanceId`, `window.__COMVI__`) | absent                  | invisible to the browser extension (documented)                      | `.with(devtools({ instanceId }))`                                                           |
| nested constructor catalogs                           | stored verbatim         | dev warning                                                          | `flattenCatalog(…)`, or compose `loader()`                                                  |
| tag markup through `t()` (`"<b>hi</b>"`)              | literal text            | dev warning; prod literal, never a throw                             | render `<T>`, or `import "@comvi/core/tags"` at your own entry                              |
| `setI18nContext`, every store, the readers, `<T>`     | untouched               | —                                                                    | —                                                                                           |
| `new I18n(options)`                                   | untouched, one argument | —                                                                    | —                                                                                           |

Every installer that table names is re-exported from `@comvi/svelte`, so each migration stays inside the one import specifier you already have.

### ICU has two shapes on this entry, and the wrong one throws

`icuCompiler` is a compiler and `icu()` is an installer, so which one you need depends on where the catalog comes from:

```svelte
<script lang="ts">
  // INLINE — the constructor ingests the catalog, so choose the compiler in the same call.
  import { createI18n, icuCompiler, setI18nContext } from "@comvi/svelte";

  setI18nContext(createI18n({ locale: "en", compiler: icuCompiler, translation }));
</script>
```

```svelte
<script lang="ts">
  // REMOTE — install BEFORE anything is ingested.
  import { createI18n, icu, loader, setI18nContext } from "@comvi/svelte";

  const i18n = createI18n({ locale: "en" })
    .with(icu())
    .with(loader({ uk: () => import("./uk.json") }));

  setI18nContext(i18n);
</script>
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any catalog reaches the host — a constructor `translation`, an `addTranslations` call, or a loader merge — and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"` before mutating anything. So `createI18n({ translation }).with(icu())` is invalid by construction: pass `compiler: icuCompiler` there instead.

### `<T>` moved to a pure seam

`<T>` used to import `@comvi/core/tags`, and that import registers tag syntax **ambiently** — so rendering rich text anywhere in a svelte app silently switched plain string-API `t()` over to parsing `<tag>` markup too. It now imports the pure `@comvi/core/rich-text` seam instead, which hands the tag grammar to core per call and registers nothing. `<T>` renders exactly as before; what changed is that it no longer decides `t()`'s behaviour behind your back. `svelte-package` preserves modules, so `dist/T.svelte` is still its own module and an app that never renders it drops the whole rich-text path.

### The tag residual

`t("Click <b>here</b>")` returns that markup as text: no entry registers tag syntax ambiently, and `@comvi/core/tags` is deliberately not re-exported here. Development warns the first time, production stays literal and never throws — a literal `<b>` is visibly broken in review, unlike a plausible-looking plural. Render `<T>` (it passes the tag extension per call, so it needs no ambient registration) or `import "@comvi/core/tags"` once at your own entry if you want tag interpolation through `t()` itself.

### Measured

Four live size fixtures gate the converged entry: `fw-svelte-default`, `fw-svelte-default-t`, `fw-svelte-icu` and `fw-svelte-full-composite`. Every row asserts ambient tag registration absent — including the `<T>` row, which its predecessor could not, because rendering `<T>` used to be exactly what bought the tag pair — and the first three also assert every unused capability module absent. The 0.5.0 re-baseline sweep has landed, so every row also carries a byte budget at the usual measured + 2%, over measurements of **6412 B** (`fw-svelte-default`), **8603 B** (`fw-svelte-default-t`), **7298 B** (`fw-svelte-icu`) and **11266 B** (`fw-svelte-full-composite`), as recorded in `scripts/size-budgets.json`. The last anchors taken before core's own convergence were 6319 B min+gz for the single-package recipe and 9836 B for the 0.4 composed root; both are HISTORICAL and neither is the converged figure. Two bundler-matrix cases exercise the published tarball on webpack and vite in development and production: `svelte-default` calls no capability at all and asserts the icu, loader, plugins and devtools subpath entries absent, while `svelte-icu` formats a real plural from the built bundle and asserts the other three absent.

See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4 for the svelte walkthrough and `core-single-entry-convergence.md` for the core break this one rides on.
