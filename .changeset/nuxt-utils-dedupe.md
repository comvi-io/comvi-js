---
"@comvi/nuxt": patch
---

Internal dedupe, behavior-preserving: the private `translationResultToString` copy in `src/runtime/utils.ts` is deleted; the composable imports it from `@comvi/core` (identical implementation).
