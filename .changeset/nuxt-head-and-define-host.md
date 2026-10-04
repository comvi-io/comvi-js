---
"@comvi/nuxt": minor
---

The module now writes `<html lang dir>` from the active locale by default (`comvi.head: false` turns it off), so `useLocaleHead()` is only needed for canonical, hreflang and `og:locale` tags. `defineComviHost()` from `@comvi/nuxt/host` types a `comvi.host.ts` factory without `satisfies NuxtHostFactory`, and in development the module throws when the factory returns the same instance twice.
