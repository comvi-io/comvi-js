---
"@comvi/nuxt": minor
---

Locale path utilities (`runtime/utils/locale-path.ts`) are now thin adapters over the shared `@comvi/locale-routing` package (new runtime dependency, exact-pinned at publish). `extractLocaleFromPath`, `buildLocalizedPath`, `splitPathAndSuffix`, and `setQueryParamInSuffix` behave byte-identically; `stripLocalePrefix`'s matching was already effectively segment-based and keeps its results, with one edge-case diff:

- Inputs are normalized to a leading slash: `stripLocalePrefix("about", locales)` now returns `/about` (was `about`, unchanged), and `""` now returns `/` (was `""`).

The middleware and composables always pass leading-slash router paths, so no observable routing change is expected in real apps. Trailing-slash preservation (`/de/about/` → `/about/`) is unchanged — it is now the shared behavior for Next too.
