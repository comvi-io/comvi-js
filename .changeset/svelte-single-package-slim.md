---
"@comvi/svelte": minor
---

**Added: the `@comvi/svelte` entry carries the whole toolkit.** Building an app used to take
two packages — the host constructor from `@comvi/core`, the bindings from `@comvi/svelte`.
One entry now carries both.

```svelte
<script lang="ts">
  import { createI18n, icuCompiler, loader, setI18nContext } from "@comvi/svelte";

  setI18nContext(
    createI18n({ locale: "en", compiler: icuCompiler }).with(loader(importMap)),
  );
</script>
```

| export                                       | what it is                                              |
| -------------------------------------------- | ------------------------------------------------------- |
| `createI18n`, `I18n`                         | core's base host — its constructor and its class        |
| `icuCompiler`, `icu`                         | from `@comvi/core/icu` — the compiler and the installer |
| `loader`, `attachLoader`, `flattenCatalog`   | from `@comvi/core/loader`                               |
| `plugins`, `attachPlugins`                   | from `@comvi/core/plugins`                              |
| `devtools`, `attachDevtools`                 | from `@comvi/core/devtools`                             |
| every store factory, the readers, `T`, types | the svelte bindings                                     |

There is no svelte-side wrapper object to build — the host goes straight into
`setI18nContext(i18n)` — so the constructor IS core's own `createI18n`, re-exported by name.
Both halves of ICU are here on purpose, so neither recipe makes a svelte app reach for a
core subpath.

The re-exports cost nothing: they are **named** re-exports of core's own bindings
(`svelte.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
and never through another wrapper. `@comvi/core/tags` is deliberately not among them:
importing it registers tag syntax ambiently, and `<T>` uses the pure `@comvi/core/rich-text`
seam instead.

**One entry, one context key.** `svelte-package` preserves modules, so this package never
had the "a provider from one entry is invisible to a hook from the other" hazard the bundled
wrappers did — every published path resolved to the same binding modules. What one entry
buys is the end of two published surfaces that had to be kept in step, and the entry
re-exports those binding modules themselves rather than wrapping them, so the `getContext`
key stays a single object. Nothing else is removed and no 0.4.x import path changes.
