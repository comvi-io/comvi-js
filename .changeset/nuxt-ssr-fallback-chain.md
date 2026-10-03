---
"@comvi/nuxt": patch
---

**Fix: SSR now loads the `fallbackLocale` chain, so a key that exists only in a fallback catalog
renders its fallback text.** Before, the server loaded only the requested locale. Fallback lookups
worked only when `fallbackLocale` was the same as `defaultLocale`; otherwise the server rendered the
raw key. The app plugin now loads the active namespaces for every fallback locale before the render,
and those catalogs reach the client in the payload. A namespace a page activates during the render
with `useI18nLoader().addActiveNamespace()` loads its fallback catalogs too, before the awaited call
resolves. The server `loadTranslations()` returns the
requested locale and its fallback chain, keyed `locale:namespace`, and `useTranslation()` loads the
chain for its namespace even when the request locale is already cached. A fallback catalog that
fails to load is reported through `loadError`, and the render continues.
