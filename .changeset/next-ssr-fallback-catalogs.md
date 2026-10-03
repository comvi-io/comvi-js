---
"@comvi/next": patch
---

**A direct load of a non-default locale no longer shows a raw key or breaks hydration.** When a key
existed only in a `fallbackLocale` catalog (for example only in `en`), opening `/uk` directly
rendered the English text on the server, but `loadTranslations()` sent the client only the `uk`
catalogs. After hydration the client rendered the raw key, React reported hydration error #418, and
the page did not recover. Switching locales on the client was unaffected.

`loadTranslations(locale)` now returns the requested locale and every locale of the host's
`fallbackLocale` chain (a string or an array, in the order lookups walk it), for each requested
namespace, and nothing outside that chain. The result is still keyed `locale:namespace`, so
`<I18nProvider messages>` needs no change. `getI18n()` loads the same chain, so a server-side
`t()` for a namespace loaded on demand also resolves through the fallback. Keep the client host on
the same `fallbackLocale` as the server host; the documented setup shares one instance, which does
this already.
