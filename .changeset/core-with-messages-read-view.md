---
"@comvi/core": minor
---

`i18n.withMessages(catalogs)` returns a read view whose `t`, `tRaw` and `hasTranslation` read each key from the given `"locale:namespace"` catalogs first and from the cache otherwise, without writing the i18n instance.
