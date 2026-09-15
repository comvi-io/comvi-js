---
"@comvi/plugin-locale-detector": patch
---

Fixed a manually re-consulted detector (e.g. via `getLanguageDetector()` after `init()`) being able to leave a fallback-suppression marker that swallowed a later, unrelated explicit choice of that same locale. The marker is now only armed while detection can still be auto-applied by `init()`.
