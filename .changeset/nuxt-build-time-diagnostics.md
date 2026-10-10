---
"@comvi/nuxt": patch
---

Two build-time diagnostics in the Nuxt module: a `i18nModule` factory that returns the wrong
shape is now rejected by name, and a missed `comvi.setup` auto-detect is no longer silent.

- **The `i18nModule` guard accepted a `VueI18n` and double-wrapped it.** It checked only that the
  returned value had a `t` function — and a `VueI18n` has one — so a factory returning
  `@comvi/vue`'s `createI18n(...)` passed, then got handed to `createI18nFromCore`, wrapping a
  wrapper. The old error message named that very import as the fix. The guard now also requires
  `init` and rejects anything carrying `core`, and the message names `createI18n` from
  `@comvi/nuxt/i18n` with a `.use(loader(map))` example.
- **A missed `comvi.setup` auto-detect produced an empty hook with no explanation.** The existing
  error only fired when `comvi.setup` was set explicitly; with the option unset and nothing
  resolved, codegen emitted `runComviSetup() {}` and the app booted with none of its hooks. When
  a file matching `comvi.setup*` exists under the source or root directory but did not resolve
  (a `.cjs`, a typo after the prefix), the module now logs the near miss at build time, naming
  the file it found and the specifier it looked for.
