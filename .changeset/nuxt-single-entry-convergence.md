---
"@comvi/nuxt": minor
---

**BREAKING (breaking change on a 0.x minor): the instance under `@comvi/nuxt` is core's base instance.**
Nuxt is the one package this convergence did not repackage — every published entry,
composable, component, middleware and server utility stays exactly where it was. What
changed sits underneath all of them: the generated `#build/comvi.i18n` template builds
core's base instance, so ICU, async loading, the plugins capability, devtools discovery and ambient tag
syntax became things a Nuxt app composes. `nuxt-framework-slim.md` carries the recipe and
the migration table; this entry states the three contracts that are Nuxt's alone.

**ICU is a compiler option.** The module hands the factory its resolved options, and the
factory takes `compiler: icuCompiler` in the same call (or the `icu` module option, for an
app with no `i18nModule`). One option covers every catalog source, whether translations
arrive from `nuxt.config`, from `comvi.setup` or from a loader. Under the default compiler
an ICU template never renders as a plural — development throws `E_ICU_SYNTAX` at ingestion,
production renders the braced segment literally and reports it through `onError` (or
`console.error`). **ICU is never enabled automatically.**

**The capability toolkit is deliberately not re-exported here.** Every other converged
package re-exports core's installers so an app never names a capability subpath;
`@comvi/nuxt` does not, on purpose. Its published surface is a Nuxt module, not an
application import, and composition happens in `comvi.i18n.ts` — an ordinary app file that
names `createI18n` plus `icuCompiler` / `loader` / `plugins` / `devtools` from core's own
pure subpaths directly. Relaying them through the module entry would put the whole toolkit
in the build-time graph of every app, including the ones that compose nothing. What
`@comvi/nuxt` does publish for that file is the type vocabulary: `NuxtInstanceFactory`,
`NuxtInstanceFactoryOptions`, `NuxtServerInstance` and `NuxtServerLoaderInstance`.

**Vue's convergence rides through.** Nuxt's rendering layer is `@comvi/vue`: `comvi.setup`
receives a `VueI18n`, and the auto-imported `<T>` is vue's component verbatim. Vue's `<T>`
moved onto the pure `@comvi/core/rich-text` seam, so rendering rich text no longer switches
string-API tag parsing on for every plain `t()` call behind your back —
`t("Click <b>here</b>")` returns that markup as text until you `import "@comvi/core/tags"`
in a Nuxt plugin. The capability calls that used to sit on `VueI18n`'s proxies move to
`i18n.core.*`. See `vue-single-entry-convergence.md` and
`core-single-entry-convergence.md`.
