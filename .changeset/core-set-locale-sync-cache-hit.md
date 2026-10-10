---
"@comvi/core": patch
---

`setLocale()` switches synchronously when the target locale's catalogs are already loaded.
