---
"@comvi/nuxt": patch
---

The Nitro server utilities work in a Nitro route. `useTranslation(event)`, `loadMessages(event, locale)` and `getRequestI18n(event, locale)` imported the module's generated `#build/*` modules, which Nuxt refuses anywhere in the Nitro build: an app with one `server/api` route that called `useTranslation(event)` failed `nuxt build` with "Vue app aliases are not allowed in server runtime". The module now registers the same generated modules as Nitro virtual modules, and the utilities import those.

`getServerRuntimeConfig(event)` reads Nitro's own `useRuntimeConfig(event)`. It read `event.context`, where Nitro puts nothing until that function is called for the event, so a route got an empty fallback: no locales, the locale cookie and `Accept-Language` ignored, every request answered in `en`.
