---
"@comvi/nuxt": patch
---

Check `localeDetection.resolveAcceptLanguage` at build time with `vm.Script` instead of `new Function`, so the module no longer uses `new Function`. The source is compiled to check that it parses and is never executed.
