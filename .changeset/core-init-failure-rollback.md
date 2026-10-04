---
"@comvi/core": patch
---

A failed `init()` now runs the cleanups its own plugins returned, in reverse order, before rejecting, so a rejected or retried instance no longer keeps their resources.
