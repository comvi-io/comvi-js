---
"@comvi/nuxt": patch
---

`useTranslation(event, { … })` on the server now takes `ns` for the namespace, the same word core's
`t(key, { ns })` and `@comvi/next`'s `getI18n({ ns })` use — nuxt's helper was the only place in the
library that spelled it `namespace`. `namespace` still works for all of 0.5 and warns once in dev; if
you pass both, `ns` wins. It is removed in 0.6.

`Accept-Language` matching also moved to the one implementation `@comvi/next` uses, so the two
frameworks now provably answer identically for the same header — a shared input table asserts both.
No header changes the locale it resolved to in this release.
