---
"@comvi/vue": patch
---

With `ssrLocale` on a core that has the loader composed and a namespace active, the first render now translates in `ssrLocale` instead of the core's previous locale, and the two `.use(installer)` texts say "instance" instead of "host".
