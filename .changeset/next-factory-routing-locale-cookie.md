---
"@comvi/next": patch
---

The `routing` that `createNextI18n` and `createNextI18nFromInstance` return keeps `localeCookie`. Both rebuilt it from `locales`, `defaultLocale`, `localePrefix` and `pathnames` only, so it named the default `NEXT_LOCALE`, and a client-side locale switch under `<ComviProvider>` wrote that cookie even when the app configured another name or `localeCookie: false`.
