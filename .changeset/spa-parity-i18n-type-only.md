---
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/vue": minor
---

**BREAKING (breaking change on a 0.x minor): `I18n` is a TYPE-only export from the four binding roots.** `createI18n(options)` and `new I18n(options)` build the same object, so the class VALUE is `@comvi/core`'s to export; `export type { I18n }` stays on every root for typing a host you compose. A `new I18n(…)` through `@comvi/react`, `@comvi/solid`, `@comvi/svelte` or `@comvi/vue` is now a type error — import the class from `@comvi/core`, or call `createI18n`.
