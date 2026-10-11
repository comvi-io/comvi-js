---
"@comvi/nuxt": patch
---

Check `localeDetection.resolveAcceptLanguage` at build time with `vm.Script` instead of `new Function`, so the module no longer contains a dynamic-code constructor.
