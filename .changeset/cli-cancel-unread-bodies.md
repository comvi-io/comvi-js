---
"@comvi/cli": patch
---

The CLI now cancels the response body of every retried 429/5xx and every 401/403 answer instead of leaving a stalled stream and its socket open.
