---
"@comvi/core": patch
---

An `init()` called from a synchronous `loadingStateChanged` listener now joins the attempt already in flight instead of starting a second one.
