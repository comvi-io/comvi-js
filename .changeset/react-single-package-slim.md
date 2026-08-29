---
"@comvi/react": minor
---

**Added: the `@comvi/react` entry carries the whole toolkit.** Building an app used to take
two packages — the host constructor from `@comvi/core`, the bindings from `@comvi/react`.
One entry now carries both.

```ts
import { createI18n, icuCompiler, loader } from "@comvi/react";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader(importMap));
```

| export                                     | what it is                                              |
| ------------------------------------------ | ------------------------------------------------------- |
| `createI18n`, `I18n`                       | core's base host — its constructor and its class        |
| `icuCompiler`, `icu`                       | from `@comvi/core/icu` — the compiler and the installer |
| `loader`, `attachLoader`, `flattenCatalog` | from `@comvi/core/loader`                               |
| `plugins`, `attachPlugins`                 | from `@comvi/core/plugins`                              |
| `devtools`, `attachDevtools`               | from `@comvi/core/devtools`                             |
| every hook, `I18nProvider`, `T`, the types | the react bindings                                      |

There is no react-side wrapper object to build — the host goes straight into
`<I18nProvider i18n={…}>` — so the constructor IS core's own `createI18n`, re-exported by
name. Both halves of ICU are here on purpose, so neither recipe makes a react app reach for
a core subpath.

The re-exports cost nothing: they are **named** re-exports of core's own bindings
(`react.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
and never through another wrapper — so the capability entries an app never calls stay out of
its module graph. `@comvi/core/tags` is deliberately not among them: importing it registers
tag syntax ambiently, and `<T>` uses the pure `@comvi/core/rich-text` seam instead.

**One entry, one context.** The package publishes exactly one entry, so there is one build
pass and one React context object: an `<I18nProvider>` and a `useI18n()` in the same app
always see each other. Nothing else is removed and no 0.4.x import path changes.
