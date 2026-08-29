---
"@comvi/vue": minor
---

**Added: the `@comvi/vue` entry carries the whole toolkit** — all three construction paths
included — so an app names one package, where it used to take the host constructor from
`@comvi/core` and the bindings from `@comvi/vue`.

```ts
// one call: a VueI18n over a base host
const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
createApp(App).use(i18n).mount("#app");

// composed host: `createCore` IS core's constructor, same package
const host = createCore({ locale: "en" }).with(loader(importMap));
const i18n = createI18nFromCore(host, { ssrLocale: "en" }); // i18n.core is exactly `host`
```

| export                                            | what it is                                                    |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `createI18n`                                      | the one-call preset — a `VueI18n` over a base host            |
| `createCore`                                      | core's own constructor, for the composed path                 |
| `createI18nFromCore`                              | unchanged — wraps a host you built, preserving its exact type |
| `I18n`                                            | the base class `createCore` instantiates                      |
| `icuCompiler`, `icu`                              | from `@comvi/core/icu` — the compiler and the installer       |
| `loader`, `attachLoader`, `flattenCatalog`        | from `@comvi/core/loader`                                     |
| `plugins`, `attachPlugins`                        | from `@comvi/core/plugins`                                    |
| `devtools`, `attachDevtools`                      | from `@comvi/core/devtools`                                   |
| `VueI18n`, the composables, `<T>`, the inject key | unchanged                                                     |

Vue is the one binding whose preset is a real function — there is a `VueI18n` to construct,
and `ssrLocale` has to reach the host before the reactive ref is seeded — so `createI18n`
here is vue's own factory and core's constructor keeps a name of its own. `createI18n` takes
the same option shape it always did, `ssrLocale` and `compiler` included, and returns
`VueI18n<D, I18n<D>>` over the BASE `I18n`, so `i18n.core` is typed without the capabilities
it does not have; the eight dropped proxies stay dropped. On vue the composition pipe goes
on the HOST, one level below the wrapper: `i18n.core.with(loader(map))`.

The re-exports cost nothing: they are **named** re-exports of core's own bindings
(`vue.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
which is exactly what this entry used to carry, and never through another wrapper.
`@comvi/core/tags` is deliberately not among them: importing it registers tag syntax
ambiently, and `<T>` uses the pure `@comvi/core/rich-text` seam instead.

**One entry, one injection key.** The package publishes exactly one entry, so there is one
build pass and one `Symbol("i18n")`: a plugin installed with `app.use(i18n)` and a
`useI18n()` in the same app always see each other. Nothing else is removed and no 0.4.x
import path changes.
