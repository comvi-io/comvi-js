---
"@comvi/solid": patch
---

With `ssrLocale` on an instance that has the loader composed and a namespace active, the first render (server and client) now paints `ssrLocale` instead of the instance's previous locale.
