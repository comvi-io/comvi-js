---
"@comvi/core": minor
---

`setLocaleAsync()` is renamed to `setLocale()`, which returns a promise that settles once the locale applies; with a loader composed, it first loads the active namespaces. The old name is gone, and assigning `i18n.locale` remains the switch that does not wait.
