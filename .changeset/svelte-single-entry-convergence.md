---
"@comvi/svelte": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/svelte` now builds the base host.** `@comvi/svelte` has re-exported core's `createI18n` and `I18n` by name since 0.4, and in 0.4 that constructor arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/svelte/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported, and it never published, so there is no deprecation debt.

Nothing about `setI18nContext()`, `useI18n()`, `<T>`, the store factories or the capability
readers changes here; this is the host underneath them, and the packaging half is in
`svelte-single-package-slim.md`. Compose what you had back — every installer is re-exported
from `@comvi/svelte`, so each fix stays inside the one specifier you already have:

| you had                                      | you add                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| ICU plurals, select, selectordinal           | `compiler: icuCompiler`, or `.with(icu())` pre-ingestion |
| loader (`registerLoader`, …)                 | `.with(loader(map))`, or `.with(attachLoader)`           |
| `.use(plugin)`, `onMissingKey`               | `.with(plugins())`, then `use(p)`                        |
| discovery (`instanceId`, `window.__COMVI__`) | `.with(devtools({ instanceId }))`                        |
| nested constructor catalogs                  | `flattenCatalog(…)`, or compose `loader()`               |
| `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`             |

```svelte
<script lang="ts">
  import { createI18n, icu, icuCompiler, loader, setI18nContext } from "@comvi/svelte";

  // INLINE — the constructor ingests the catalog, so choose the compiler in the same call.
  setI18nContext(createI18n({ locale: "en", compiler: icuCompiler, translation }));
  // REMOTE — install ahead of the first catalog.
  setI18nContext(createI18n({ locale: "en" }).with(icu()).with(loader(importMap)));
</script>
```

`.with(icu())` is **pre-ingestion only**: the compiler locks at the first catalog that
reaches the host and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"`.

**`<T>` moved to a pure seam.** It used to import `@comvi/core/tags`, whose import registers
tag syntax **ambiently**, so rendering rich text anywhere silently switched plain `t()` over
to parsing `<tag>` markup too. It now imports the pure `@comvi/core/rich-text` seam, which
hands the grammar to core per call. `<T>` renders exactly as before; what changed is that it
no longer decides `t()`'s behaviour behind your back — that is now your own
`import "@comvi/core/tags"`. `svelte-package` preserves modules, so an app that never
renders `<T>` drops the whole rich-text path. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4 and
`core-single-entry-convergence.md`.
