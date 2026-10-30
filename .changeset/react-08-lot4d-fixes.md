---
"@comvi/react": minor
---

`useFormat()` formats in the configured chain of the locale the render shows — the target of an `<I18nHandover>` too — so a locale the runtime's Intl lacks falls back to the configured fallback locale (`locale: "xx"`, `fallbackLocale: "de"`: `1234.5` → `1.234,5`), and a server and a browser with different Intl data agree. A typed `t()` of a key with a tag returns `string | ReactElement`.
