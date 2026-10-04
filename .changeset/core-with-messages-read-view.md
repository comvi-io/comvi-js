---
"@comvi/core": minor
---

`i18n.withMessages(catalogs)` returns a read view whose `t`, `tRaw` and `hasTranslation` resolve the given `"locale:namespace"` catalogs first, for each call, without writing the i18n instance.
