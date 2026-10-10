---
"@comvi/vue": patch
---

`setLocale()` and the `locale` ref now supersede a locale switch that is still loading, including a pending `ssrLocale`, so the last request wins.
