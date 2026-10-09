---
"@comvi/plugin-locale-detector": patch
---

**A locale switch made while `init()` is still loading stays the cached choice.** The detector
holds an init-time detection back until `initialized`; a `setLocale()` in that window was written
at once and then overwritten by the held detection, leaving the cache on one locale and the UI on
another. The switch now supersedes the held detection.
