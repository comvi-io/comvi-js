---
"@comvi/vue": minor
---

`useFormat()` formats in the configured chain of the locale on screen, so a locale the runtime's Intl lacks falls back to the configured fallback locale (`locale: "xx"`, `fallbackLocale: "de"`: `1234.5` → `1.234,5`). A typed `t()` of a key with a tag returns `string | VNodeArrayChildren`.
