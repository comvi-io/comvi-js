---
"@comvi/core": patch
---

The constructor and `setFallbackLocale()` now copy the fallback array they receive, and accept `readonly string[]`, so mutating the caller's array no longer changes translations without `configChanged`.
