---
"@comvi/nuxt": patch
---

`useLocaleHead()` now replaces every hyphen (global replace) in an `iso` when it emits `og:locale` / `og:locale:alternate`: a script-and-region code such as `zh-Hant-TW` becomes `zh_Hant_TW`, not `zh_Hant-TW`. Two-part codes were unaffected.
