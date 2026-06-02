---
"@comvi/nuxt": minor
---

Align Nuxt with the Vue/Core 0.3 runtime API and composable return shape.

Nuxt's `useI18n()` facade now tracks the Vue 0.3 reactive helpers exposed by `@comvi/vue`, while the module keeps its existing setup and routing ergonomics. This makes the Nuxt package part of the 0.3 framework API release instead of publishing a patch that would pull in new 0.3 runtime dependencies.

Also fixes locale middleware fallback resolution when `detectBrowserLanguage.fallbackLocale` is an array: the middleware now selects the first configured fallback that is present in `locales` instead of falling back to `defaultLocale`.
