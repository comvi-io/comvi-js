---
"@comvi/next": minor
---

`createMiddleware` and `defineRouting` take the locale options `@comvi/nuxt` takes, normalized by one shared schema: `localeCookie` (a name, `{ name, maxAge, secure, sameSite, domain }` or `false`) and `localeDetection` (`{ order, queryParam, headerName, resolveAcceptLanguage }` or `false`), so `?lang=de` can pick the locale and persistence can be turned off; `localeDetection.cookieName` and `cookieSecure` are gone. Every error and warning starts `[@comvi/next]`, and the not-configured, no-loader and failed-load messages share their wording with `@comvi/nuxt`.
