---
"@comvi/solid": patch
---

The locale signal now reads the instance on `localeChanged`, so a listener that switches the locale again no longer leaves it on a stale locale.
