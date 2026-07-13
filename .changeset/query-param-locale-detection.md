---
"@comvi/nuxt": minor
---

Locale detection from a query parameter:

- `detectBrowserLanguage.queryParam: "lang"` makes the route middleware read an explicit locale from the URL query (e.g. `?lang=de`) on both server and client navigation. Disabled when unset.
- Priority: explicit path prefix > query parameter > implied default of a prefixless path (as-needed mode) > cookie > Accept-Language > fallback. Values outside `locales` are ignored.
- With `localePrefix: "never"` and cookies disabled this reproduces the classic public-page setup (query beats Accept-Language, URLs stay untouched).
- `useSwitchLocalePath()` keeps the configured locale query synchronized with its target locale in every prefix mode, while preserving unrelated query parameters and hashes.
