---
"@comvi/react": minor
---

**BREAKING (breaking change on a 0.x minor): `createI18n` from `@comvi/react` now builds the base host.** `@comvi/react` has re-exported core's `createI18n` and `I18n` by name since 0.4, and in 0.4 that constructor arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/react/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported, and it never published, so there is no deprecation debt.

Nothing about `<I18nProvider>`, `useI18n()`, `<T>`, the selector hooks or the capability
hooks changes here; this is the host underneath them, and the packaging half is in
`react-single-package-slim.md`. Compose what you had back — every installer is re-exported
from `@comvi/react`, so each fix stays inside the one specifier you already have:

| you had                                      | you add                                            |
| -------------------------------------------- | -------------------------------------------------- |
| ICU plurals, select, selectordinal           | `compiler: icuCompiler` in the constructor options |
| loader (`registerLoader`, …)                 | `.use(loader(map))`, or `.use(attachLoader)`       |
| `.use(plugin)`, `onMissingKey`               | `.use(definePlugin(p))`, or `registerPlugin(p)`    |
| discovery (`instanceId`, `window.__COMVI__`) | `.use(devtools({ instanceId }))`                   |
| `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`       |

```tsx
import { createI18n, icuCompiler, loader } from "@comvi/react";

// INLINE — the constructor ingests the catalog.
const inline = createI18n({ locale: "en", compiler: icuCompiler, translation });
// REMOTE — the same option, in the same place.
const remote = createI18n({ locale: "en", compiler: icuCompiler }).use(loader(importMap));
```

`compiler` is a constructor field held for the instance's life, so one option covers every
catalog source, and nothing about composition is ordered.

Residual: `t("Click <b>here</b>")` returns that markup as text, because no entry registers
tag syntax ambiently — development warns the first time, production stays literal and never
throws. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §3 and
`core-single-entry-convergence.md`.
