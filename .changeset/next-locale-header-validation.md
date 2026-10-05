---
"@comvi/next": patch
---

`getLocale()` now honours the `x-comvi-locale` header only when it is in `routing.locales` (from the config module or `createNextI18nFromHost`), or a well-formed locale code without routing; runtime texts say "i18n instance", and the no-loader warning names `.use(cdnLoader({ cdnUrl }))` or `.use(loader(map))`.
