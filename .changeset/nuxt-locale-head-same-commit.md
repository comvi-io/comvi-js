---
"@comvi/nuxt": patch
---

Fix `useLocaleHead()` updating `<html lang>` and `<html dir>` a frame after the translated text on a client-side locale switch, so the page no longer briefly shows the new language under the old `lang` and `dir`.
