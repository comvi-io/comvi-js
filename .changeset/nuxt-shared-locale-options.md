---
"@comvi/nuxt": minor
---

The module takes the locale options `@comvi/next` takes, normalized by one shared schema: `localeCookie` and `localeDetection` (with `order`, `headerName` and `resolveAcceptLanguage`), plus `comvi.ns`, and `useTranslation(event)` reads the locale from the path and `queryParam` in the route middleware's order. `detectBrowserLanguage`, `fallbackLanguage` and `useTranslation`'s `namespace` are gone and module setup fails naming the replacement; runtime config carries `localeCookie` and `localeDetection`, so `NUXT_PUBLIC_COMVI_*` overrides use those keys.
