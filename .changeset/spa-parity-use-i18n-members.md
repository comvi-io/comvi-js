---
"@comvi/react": minor
"@comvi/vue": minor
---

**`useI18n()` returns the same member names in every binding.** `isInitialized` and `cacheRevision` — on `@comvi/solid` and `@comvi/svelte` for a release — are now on `@comvi/react` (render snapshots beside `isLoading`) and `@comvi/vue` (readonly refs, `VueI18n.isInitialized` / `VueI18n.cacheRevision`). React's four formatters (`formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime`) take the trailing `locale` override the other three already had; it defaults to the render locale. Vue's `hasTranslationNow` / `hasLocaleNow` stay for now (removing them is a source break) and are tombstoned for the next wave.

The durable half: `scripts/wrapper-hooks-parity.test.mjs` now diffs the four `UseI18nReturn` member NAME SETS, read from each source interface, against one allow-list of justified differences with a reason each, and checks every formatter's arity — so the next such drift fails the release instead of shipping.
