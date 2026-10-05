---
"@comvi/core": patch
---

`i18n.withMessages()` returns an object with only `t`, `tRaw` and `hasTranslation`, so the read view can no longer reach the i18n instance's write methods at runtime, and the i18n instance has a `localeRevision` count of its locale changes for framework bindings.
