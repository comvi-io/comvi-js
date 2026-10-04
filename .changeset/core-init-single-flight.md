---
"@comvi/core": patch
---

Concurrent `init()` calls now share one in-flight attempt, so plugins run once and `isInitializing` stays true until that attempt settles.
