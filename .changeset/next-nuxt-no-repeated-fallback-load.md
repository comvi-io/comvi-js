---
"@comvi/next": patch
"@comvi/nuxt": patch
---

**The server adapters no longer repeat a fallback load core has made.** `@comvi/core` now loads the
fallback chain itself at `init()` and on a namespace activation. The Next and Nuxt server paths
went on loading it as well, so a fallback catalog that fails to load was requested and reported
twice per request, and in Nuxt a chain reload racing core's activation cancelled and refetched
catalogs that were loading fine. A catalog that fails inside core's own load is now remembered for
the request and not attempted again, and Nuxt runs its own chain load after the activation
instead of beside it. A pair that failed on the server is not in the hydration payload, so the
browser asks for it once.
