---
"@comvi/next": patch
---

**Fix: `getI18n()` now loads the fallback chain even when the request locale is already cached.** It
skipped loading whenever the request locale's catalog was in the cache, so a Server Component that
called `getI18n()` without a prior `loadMessages()` rendered the raw key for a key that exists
only in a `fallbackLocale` catalog. It now loads its namespace for every locale of the chain that is
missing. Concurrent requests that need the same `locale:namespace` pair now share one fetch instead
of starting two. A fallback catalog that fails to load is reported through `loadError`, and
`onError` fires as well; the render continues. A failed catalog is attempted once per request, so
`loadMessages()` does not retry what `getI18n()` already failed to load, and the client gets the
catalogs the server render read. A fallback that keeps failing is retried on the next request that
needs it.
