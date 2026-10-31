---
"@comvi/react": minor
---

`useFormat()` formats in the configured chain of the locale the render shows — the target of an `<I18nHandover>` too — so a locale the runtime's Intl lacks falls back to the configured fallback locale (`locale: "xx"`, `fallbackLocale: "de"`: `1234.5` → `1.234,5`), and a server and a browser format with the same locale chain (identical output still depends on matching Intl data). A typed `t()` of a key with a tag returns `string | ReactElement`. `<I18nHandover locale>` with a locale that is not a tag (`""` too) now throws a `RangeError` in its render, before the children render and whatever they use, and publishes nothing; it used to report `invalid_locale` and render the instance's locale. Match a route locale against your supported locales before passing it. A valid locale with no catalog behaves as before.
