---
"@comvi/core": patch
---

A plugin that exceeds its timeout no longer leaks the cleanup it returns later: the cleanup is queued while the instance is live and runs at once after a failed `init()` or `destroy()`, and an invalid late return is reported through `onError`.
