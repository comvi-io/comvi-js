---
"@comvi/nuxt": minor
---

New module option `icu: boolean` (default `false`). The generated default instance is the base
instance and has no `.use()` seam of yours to compose on, so an app without `i18nModule` had no
way to choose the ICU compiler at all. With `icu: true` the generated `comvi.i18n` imports
`icuCompiler` from `@comvi/core/icu` and passes `compiler: icuCompiler` to both the vue
wrapper and the raw core constructor; with the default `false` the generated module does not
mention `@comvi/core/icu`, so the choice costs nothing when unmade. When `i18nModule` is set
the option is ignored with a one-line build-time warning — a composed instance picks its own
compiler.

Loader, plugins capability and devtools discovery still arrive only through `i18nModule`. ICU is
the one capability that is a constructor argument rather than something `.use()` can pipe
on, which is why it alone gets a module option. **ICU is never enabled automatically.**
