---
"@comvi/solid": minor
---

**Added: the `@comvi/solid` entry carries the whole toolkit.** Building an app used to take
two packages — the host constructor from `@comvi/core`, the bindings from `@comvi/solid`.
One entry now carries both.

```ts
import { createI18n, icuCompiler, loader } from "@comvi/solid";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader(importMap));
```

| export                                          | what it is                                              |
| ----------------------------------------------- | ------------------------------------------------------- |
| `createI18n`, `I18n`                            | core's base host — its constructor and its class        |
| `icuCompiler`, `icu`                            | from `@comvi/core/icu` — the compiler and the installer |
| `loader`, `attachLoader`, `flattenCatalog`      | from `@comvi/core/loader`                               |
| `plugins`, `attachPlugins`                      | from `@comvi/core/plugins`                              |
| `devtools`, `attachDevtools`                    | from `@comvi/core/devtools`                             |
| every primitive, `I18nProvider`, `T`, the types | the solid bindings                                      |

There is no solid-side wrapper object to build — the host goes straight into
`<I18nProvider i18n={…}>` — so the constructor IS core's own `createI18n`, re-exported by
name. Both halves of ICU are here on purpose, so neither recipe makes a solid app reach for
a core subpath.

The re-exports cost nothing: they are **named** re-exports of core's own bindings
(`solid.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
and never through another wrapper — so the capability entries an app never calls stay out of
its module graph. `@comvi/core/tags` is deliberately not among them: importing it registers
tag syntax ambiently, and `<T>` uses the pure `@comvi/core/rich-text` seam instead.

**One entry, one context.** The package publishes exactly one entry, so there is one build
pass and one solid context object: an `<I18nProvider>` and a `useI18n()` in the same app
always see each other. Nothing else is removed and no 0.4.x import path changes.
