---
"@comvi/svelte": patch
---

The locale store now reads the instance on `localeChanged`, so a listener that switches the locale again no longer leaves it on a stale locale.
