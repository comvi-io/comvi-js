---
"@comvi/nuxt": minor
---

The module takes the locale options `@comvi/next` takes, `localeCookie` and `localeDetection` (now with `order`, `headerName` and `resolveAcceptLanguage`), plus `comvi.ns`; `detectBrowserLanguage` keeps working through 0.5 and warns in development. Runtime config carries the resolved `localeCookie` and `localeDetection` instead of `cookieName` and `detectBrowserLanguage`, so `NUXT_PUBLIC_COMVI_*` overrides use the new keys. `useTranslation(event)` now reads the locale from the request path and `queryParam` before the cookie, in the route middleware's order, so `/de/...` and `?lang=de` answer `de` there too.
