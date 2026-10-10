---
"@comvi/plugin-fetch-loader": patch
---

A load that follows `reloadMessages()` or `clearMessages()` now starts a new request instead of joining the abandoned one, so it no longer returns the stale catalog or the old request's `AbortError`.
