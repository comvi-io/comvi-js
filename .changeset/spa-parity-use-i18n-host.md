---
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
---

**`useI18nHost()` is THE name for "give me the host".** React, solid and svelte each export `useI18nHost(): WrapperI18nHost`, the bare host the nearest provider / `setI18nContext` ancestor holds. Solid's `useI18nContext()` and svelte's `getI18nContext()` return the same object and are `@deprecated` toward it (svelte's own rule is `useI18n*`, not `getI18n*`, so one grep finds the API in all three); react's legacy combined `useI18nContext()` keeps its already-deprecated name. Purely additive. Vue's equivalent is `inject(I18N_INJECTION_KEY).core`, documented in its README rather than adding a fourth spelling.
