---
"@comvi/locale-routing": minor
---

Initial release. Framework-neutral locale routing primitives extracted from `@comvi/next` and `@comvi/nuxt`, which previously carried two drifting copies: `extractLocaleFromPath`, `stripLocalePrefix` (segment-based matching + trailing-slash preservation), `splitPathAndSuffix`, `setQueryParamInSuffix`, and `buildLocalizedPath` (locale prefix modes `always`/`as-needed`/`never`, with an optional Next-style `pathnames` slug map). Zero dependencies, pure functions, no `node:`/`url` imports.
