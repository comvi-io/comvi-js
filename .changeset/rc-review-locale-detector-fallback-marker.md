---
"@comvi/plugin-locale-detector": patch
---

Fixed a manually re-consulted detector (e.g. via `getLanguageDetector()`, whether called before `init()` has ever run or long after it has settled) being able to leave a fallback-suppression marker that swallowed a later, unrelated explicit choice of that same locale. The marker is now armed only during `init()`'s own detector call, the one time core can auto-apply it.
