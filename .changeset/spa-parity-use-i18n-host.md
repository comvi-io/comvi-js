---
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
---

**`useI18nInstance()` is THE name for "give me the host".** React, solid and svelte each export `useI18nInstance(): WrapperI18nInstance`, the bare host the nearest provider / `setI18nContext` ancestor holds. It is the only name: solid's `useI18nContext()`, svelte's `getI18nContext()` and react's combined `useI18nContext()` are removed (svelte's own rule is `useI18n*`, not `getI18n*`, so one grep finds the API in all three). React's per-axis reads are `useI18n()`, `useLocale()` and `useIsLoading()`. Vue's equivalent is `inject(I18N_INJECTION_KEY).core`, documented in its README rather than adding a fourth spelling.
