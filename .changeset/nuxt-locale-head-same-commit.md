---
"@comvi/nuxt": patch
---

Fix `useLocaleHead()` updating `<html lang>` and `<html dir>` a frame after the translated text on a client-side locale switch, so the page no longer briefly shows the new language under the old `lang` and `dir`; a `lang` or `dir` your app sets itself with a higher-priority `useHead()` still wins.

Fix `useI18n().setLocale()` switching back to an earlier locale when a newer `setLocale()` call overtook it.
