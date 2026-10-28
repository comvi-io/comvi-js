---
"@comvi/core": minor
---

`handover(i18n)` on `@comvi/core/internal` (re-exported by `@comvi/vue`): what a server render gives the browser — the locale, `timeZone`, the clock and the catalogs of every active namespace in the locale's chain, in the shape of `createI18n({ catalogs })`. A development build throws when the instance has no `timeZone`. The component types `TComponentFor` and `BoundTFor` take an optional flag that makes `Tag` params optional props, for a binding whose `<T>` also takes a tag handler from a slot (Vue); the typo guard is the same.
