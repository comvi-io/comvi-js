---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/vue": minor
---

**BREAKING** (0.8-internal) — `formatRelativeTime(i18n, date, options?, locale?)` and `useFormat().relative(date, options?)` take `now` as a member of the options (`{ now, numeric, style }`), like every other formatter; it was a positional argument before the options. `now` is not passed to Intl and does not split the formatter cache.
