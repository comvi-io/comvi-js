---
"@comvi/next": patch
---

Internal dedupe, behavior-preserving: the private `translationResultToString`/`virtualNodeToText` copies in `src/server/getI18n.ts` are deleted; the server helper imports `translationResultToString` from `@comvi/core` (identical implementation).
