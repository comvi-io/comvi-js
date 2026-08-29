---
"@comvi/react": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/react` now builds the base host.** `@comvi/react` has re-exported core's `createI18n` and `I18n` by name since 0.4, and in 0.4 that constructor arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/react/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported, and it never published, so there is no deprecation debt.

Nothing about `<I18nProvider>`, `useI18n()`, `<T>`, the selector hooks or the capability
hooks changes here; this is the host underneath them, and the packaging half is in
`react-single-package-slim.md`. Compose what you had back — every installer is re-exported
from `@comvi/react`, so each fix stays inside the one specifier you already have:

| you had                                      | you add                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| ICU plurals, select, selectordinal           | `compiler: icuCompiler`, or `.with(icu())` pre-ingestion |
| loader (`registerLoader`, …)                 | `.with(loader(map))`, or `.with(attachLoader)`           |
| `.use(plugin)`, `onMissingKey`               | `.with(plugins())`, then `use(p)`                        |
| discovery (`instanceId`, `window.__COMVI__`) | `.with(devtools({ instanceId }))`                        |
| nested constructor catalogs                  | `flattenCatalog(…)`, or compose `loader()`               |
| `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`             |

```tsx
import { createI18n, icu, icuCompiler, loader } from "@comvi/react";

// INLINE — the constructor ingests the catalog, so choose the compiler in the same call.
const inline = createI18n({ locale: "en", compiler: icuCompiler, translation });
// REMOTE — install ahead of the first catalog.
const remote = createI18n({ locale: "en" }).with(icu()).with(loader(importMap));
```

`.with(icu())` is **pre-ingestion only**: the compiler locks at the first catalog that
reaches the host and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"`, so
`createI18n({ translation }).with(icu())` is invalid by construction.

Residual: `t("Click <b>here</b>")` returns that markup as text, because no entry registers
tag syntax ambiently — development warns the first time, production stays literal and never
throws. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4 and
`core-single-entry-convergence.md`.
