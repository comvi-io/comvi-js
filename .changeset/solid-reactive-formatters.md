---
"@comvi/solid": patch
---

`formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` from `useI18n()` now follow the locale like `t()`, so JSX, `createMemo` and `createEffect` that call them re-run on a locale switch, and a trailing `locale` argument still overrides it.
