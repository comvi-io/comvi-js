---
"@comvi/next": patch
---

`getLocale()` now honours the `x-comvi-locale` header only when it is in `routing.locales` (or a well-formed locale code without routing), and runtime texts say "instance" instead of "host", with the no-loader warning naming `.use(cdnLoader({ cdnUrl }))` or `.use(loader(map))`.
