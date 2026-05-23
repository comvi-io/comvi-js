---
"@comvi/vue": minor
---

Add the Vue 0.3 reactive API surface for loaded locales, active namespaces, default namespace, reactive hasTranslation/hasLocale helpers, and config-change-aware translation recomputation. This intentionally changes pre-1.0 composable return shapes; consumers should read `.value` from reactive helpers.
