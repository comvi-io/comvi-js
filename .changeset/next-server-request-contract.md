---
"@comvi/next": patch
---

**The server pipeline resolves every lookup against the request locale; the shared host contributes
catalog and loader only.**

Your i18n instance is created once at module scope and shared by every request a Next.js server
process handles. Every lookup under `getI18n()` already named the request locale explicitly, but
nothing said so: it held because each call site happened to be written that way, and the next
server helper someone added was free to translate through the instance and pick up its
process-wide locale instead. That is now the type. The internal server host type carries no `t` or
`tRaw`, so a locale-implicit server lookup does not compile, and `getI18n()` reaches the
translator through one named widening that binds the request locale into every call.

`getI18n()` also resolves the request locale **before** it initializes the instance. A request that
cannot determine its locale — no `setRequestLocale()`, no middleware header — now throws without
having triggered the one-time `init()`, whose default-namespace load runs at the instance's own
configured locale. Previously such a request initialized the instance as a side effect of failing.
One consequence worth knowing: when both would have failed, the locale error now wins. A request
with no locale against an instance whose `init()` throws reports `[@comvi/next] Locale not set.`
rather than the initialization failure.

Two writes still travel from a request to the shared instance, both unchanged and both
deliberate: the server render's `addTranslations()`, which is additive and keyed by
`locale:namespace`, and `init()`'s one-time default-namespace load at the instance's own locale.
The package's tests now pin that no request writes the shared instance's locale or its active
namespaces.

No API change. `createNextI18n()`, `setI18n()`, `createNextI18nFromHost()`, `loadTranslations()`,
`setRequestLocale()` and `<I18nProvider>` all work exactly as before.
