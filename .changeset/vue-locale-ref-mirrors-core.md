---
"@comvi/vue": patch
---

The `locale` ref now mirrors the core when an `ssrLocale` catalog is still loading or fails to load, instead of reporting a locale the instance is not in; the two `.use(installer)` texts say "i18n instance".
