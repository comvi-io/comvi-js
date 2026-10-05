---
"@comvi/nuxt": patch
---

The route middleware now ignores an unknown `localeDetection.order` entry instead of reading `Accept-Language` for it.
