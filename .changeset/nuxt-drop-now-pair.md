---
"@comvi/nuxt": minor
---

**BREAKING (breaking change on a 0.x minor): the auto-imported `useI18n()` no longer returns `hasTranslationNow` / `hasLocaleNow`.** It extends `@comvi/vue`'s return type, which dropped the pair because `hasTranslation` / `hasLocale` are already the non-reactive form in the other bindings. Both are unchanged on the instance: `useNuxtApp().$i18n.hasTranslationNow(key, opts?)`.
