---
"@comvi/nuxt": minor
---

New module option `icu: boolean` (default `false`). The generated default host is the base host and has no `.with()` seam, so an app without `hostModule` had no way to choose the ICU compiler at all. With `icu: true` the generated `comvi.host` imports `icuCompiler` from `@comvi/core/icu` and passes `compiler: icuCompiler` to both the vue wrapper and the raw core constructor; with the default `false` the generated module does not mention `@comvi/core/icu`, so the choice costs nothing when unmade. When `hostModule` is set the option is ignored with a one-line build-time warning — a composed host picks its own compiler. Loader, plugin host and devtools discovery still arrive only through `hostModule`; ICU is the one capability that is a constructor argument rather than a pipeable installer, which is why it alone gets a module option. ICU is never enabled automatically.
