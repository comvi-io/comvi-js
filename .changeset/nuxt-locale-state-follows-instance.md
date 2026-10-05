---
"@comvi/nuxt": patch
---

The locale state and cookie now follow the instance on `localeChanged`, so a `comvi.setup` listener that switches again no longer leaves them stale.
