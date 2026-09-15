---
"@comvi/vue": minor
---

**Added: the `@comvi/vue` entry carries the whole toolkit** — all three construction paths
included — so an app names one package, where it used to take the host constructor from
`@comvi/core` and the bindings from `@comvi/vue`.

```ts
// one call: a VueI18n over a base host
const plain = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
createApp(App).use(plain).mount("#app");

// composed: `.use(…)` runs the installer on the host and widens `i18n.core`
const composed = createI18n({ locale: "en", ssrLocale: "en" }).use(loader(importMap));
composed.core.reloadTranslations(); // typed: the loader is on `core`

// host built elsewhere: core's own constructor, imported from @comvi/core
// (`import { createI18n as createCore } from "@comvi/core"`)
const host = createCore({ locale: "en" }).use(loader(importMap));
const wrapped = createI18nFromCore(host, { ssrLocale: "en" }); // wrapped.core is exactly `host`
```

| export                                            | what it is                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `createI18n`                                      | the preset — a `VueI18n` over a base host, with `.use(…)` on it                |
| `createI18nFromCore`                              | unchanged — wraps that host, preserving its exact type                         |
| `I18n` (type only)                                | the base class `createI18n` produces — a runtime value only from `@comvi/core` |
| `icuCompiler`                                     | from `@comvi/core/icu` — the ICU compiler                                      |
| `loader`, `attachLoader`                          | from `@comvi/core/loader`                                                      |
| `plugins`, `definePlugin`                         | from `@comvi/core/plugins`                                                     |
| `devtools`                                        | from `@comvi/core/devtools`                                                    |
| `VueI18n`, the composables, `<T>`, the inject key | unchanged                                                                      |

Vue is the one binding whose preset is a real function — there is a `VueI18n` to construct,
and `ssrLocale` has to reach the host before the reactive ref is seeded — so `createI18n`
here is vue's own factory and core's constructor keeps a name of its own. `createI18n` takes
the same option shape it always did, `ssrLocale` and `compiler` included, and returns
`VueI18n<D, I18n<D>>` over the BASE `I18n`, so `i18n.core` is typed without the capabilities
it does not have; the eight dropped proxies stay dropped. The composition pipe goes on that
wrapper: `createI18n(options).use(loader(map))` composes on the host underneath and retypes
`core` to match.

`attachPlugins` / `attachDevtools` are deliberately NOT among them: they are the low-level
pair `plugins()` / `devtools()` already configure, and they stay on `@comvi/core/plugins` and
`@comvi/core/devtools` (see `roots-drop-attach-pair.md`).

The re-exports cost nothing: they are **named** re-exports of core's own bindings
(`vue.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
which is exactly what this entry used to carry, and never through another wrapper.
`@comvi/core/tags` is deliberately not among them: importing it registers tag syntax
ambiently, and `<T>` uses the pure `@comvi/core/rich-text` seam instead.

**One entry, one injection key.** The package publishes exactly one entry, so there is one
build pass and one `Symbol("i18n")`: a plugin installed with `app.use(i18n)` and a
`useI18n()` in the same app always see each other. No 0.4.x import specifier changes.

**Nine 0.4.x named VALUE exports go, though.** Replacing `export * from "@comvi/core"` with
named re-exports plus `export type *` drops `TranslationCache`, `createBoundTranslation`,
`translationResultToString`, `formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection` and `createElement` from this entry's value surface.
Types are unaffected. `useI18n()` returns the four formatters and `dir` already bound to the
locale, and all nine are still exported by `@comvi/core`, so each is a one-line import move;
the mapping is tabled in MIGRATION.md §3 and the package README.
