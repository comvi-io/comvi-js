---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/vue": minor
"@comvi/next": minor
---

**BREAKING** — interpolation defaults are gone. 0.7 code that used them loses: `createI18n({ defaultParams })`, the instance's `setDefaultParams()` and its `defaultParams` getter (`@comvi/core`); `defaultParams` and `setDefaultParams` on `useI18n()` (`@comvi/react`, `@comvi/vue`; Solid and Svelte list them with their own removals); `createNextI18n({ defaultParams })` (`@comvi/next`). There is no replacement API, and the generated types make every param a message uses required. Migration: pass the params to each `t(key, params)` call — an app may keep one object of shared values or tag handlers and spread it into its calls; hand server data a Client Component needs to it as an ordinary prop.
