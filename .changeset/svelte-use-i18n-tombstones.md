---
"@comvi/svelte": minor
---

**A 0.4 destructure of a relocated member now says where it went.** The four members that left `useI18n()` in 0.5 — `addActiveNamespace`, `reloadTranslations` and `onLoadError` (now `useI18nLoader()`), `onMissingKey` (now `useI18nPlugins()`) — are re-declared on `UseI18nReturn` as `@deprecated` tombstones typed `never`. Each still autocompletes, struck through, with the acquisition in its tooltip (`const { reloadTranslations } = useI18nLoader()`), and any use is a type error rather than the bare "Property does not exist" that never said where to look. Type-only: the object `useI18n()` returns is unchanged, in every build, and the tombstones cost zero runtime bytes. The tombstone declarations are removed in 0.6.
