---
"@comvi/svelte": patch
---

`formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` from `useI18n()` now follow the locale like `$t`, so markup and `$derived` that call them re-run on a locale switch, and a trailing `locale` argument still overrides it.
