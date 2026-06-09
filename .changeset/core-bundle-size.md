---
"@comvi/core": minor
"@comvi/vue": patch
"@comvi/react": patch
"@comvi/solid": patch
"@comvi/svelte": patch
---

Bundle-size pass for @comvi/core (−17% min, −7% gzip for consumers; more when formatters are unused).

**BREAKING (@comvi/core):** `formatNumber` / `formatDate` / `formatCurrency` / `formatRelativeTime` and the `dir` getter moved off the `I18n` class to standalone tree-shakeable exports. Migrate `i18n.formatNumber(v, opts)` → `formatNumber(i18n, v, opts)` and `i18n.dir` → `getTextDirection(i18n.locale)`. Framework bindings (`useI18n`, `useFormatters`) keep their existing API — no changes needed in components.

Other changes:

- Internal class members now use native `#private`, so app bundlers mangle them (CDN UMD 25.5 → 21.2 kB).
- `TranslationCache.getInternalMap()` returns the snapshot typed as `ReadonlyMap` without a runtime wrapper.
- New `development` export condition ships readable error messages in dev; the production artifact keeps compact `E_*` codes.
