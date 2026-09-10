---
"@comvi/nuxt": patch
---

`getRequestI18n()` now forwards `basicHtmlTags` as `tagInterpolation` to the request-scoped host, the same way the app plugin does. A server route that renders rich text off the request host keeps the whitelisted elements instead of flattening them to text.
