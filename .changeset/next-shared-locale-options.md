---
"@comvi/next": minor
---

`createMiddleware` takes the locale options `@comvi/nuxt` takes: `localeCookie` (a name, `{ name, maxAge, secure, sameSite, domain }` or `false`) and `localeDetection` (`{ order, queryParam, headerName, resolveAcceptLanguage }` or `false`), so `?lang=de` can pick the locale and persistence can be turned off. `localeDetection.cookieName` and `cookieSecure` keep working through 0.5 and warn in development.
