---
"@comvi/core": patch
"@comvi/svelte": patch
"@comvi/vue": patch
"@comvi/react": patch
"@comvi/solid": patch
---

The formatters now pass the fallback-locale chain to `Intl`: without an explicit `locale` argument they format with `[locale, ...fallbackLocales]`, so a locale the runtime has no data for formats in the first fallback it does have instead of the runtime default. A fallback `Intl` rejects as a tag (a catalog key such as `en_US`) is skipped, never thrown on. An explicit `locale` argument is still passed alone. `LocaleSource` gains an optional `fallbackLocales`, and the instance exposes `i18n.fallbackLocales`, a read-only array that `setFallbackLocale()` replaces rather than changes. The bound formatters in every binding follow the same chain and re-render on `setFallbackLocale()`; `useFormatters()` identity is now stable per locale and fallback chain.
