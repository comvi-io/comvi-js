---
"@comvi/nuxt": minor
---

The module now writes `<html lang dir>` from the active locale by default (`comvi.head: false` turns it off), so the call is optional for those two attributes; `useLocaleHead()` is still needed for canonical, hreflang and `og:locale` tags, and the `lang` and `dir` it writes agree with the module's. `defineComviI18n()` from `@comvi/nuxt/i18n` types a `comvi.i18n.ts` factory without `satisfies NuxtInstanceFactory`, and in development the module throws when the factory returns the same instance twice.
