---
"@comvi/plugin-fetch-loader": patch
---

A CDN catalog whose JSON root is not an object is now a reported load failure.

The CDN path accepted any JSON root and handed it to `addMessages`, so a string became
per-character keys, an array numeric ones and `null` an empty catalog — a silently wrong catalog
instead of an error. It now runs the same shape check as the API path, which both paths share, and
the failure reaches `onLoadError` like any other.
