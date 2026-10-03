---
"@comvi/next": patch
---

**Fix: `getI18n()` now loads the fallback chain even when the request locale is already cached.** It
skipped loading whenever the request locale's catalog was in the cache, so a Server Component that
called `getI18n()` without a prior `loadTranslations()` rendered the raw key for a key that exists
only in a `fallbackLocale` catalog. It now loads its namespace for every locale of the chain that is
missing. Concurrent requests that need the same `locale:namespace` pair now share one fetch instead
of starting two. A fallback catalog that fails to load is still reported through `loadError`, and
the render continues. A fallback that keeps failing is retried on every request that needs it.
