---
"@comvi/core": patch
---

`clearTranslations()` followed by `reloadTranslations()` now refetches, instead of quietly doing
nothing.

This is the editor-save and webhook-refresh flow: drop everything, fetch it again. A scopeless
`clearTranslations()` used to clear the active namespace set along with the catalogs, so the host
no longer knew what it had been serving. `reloadTranslations()` then had nothing to reload and
resolved without a single request, and a following `setLocaleAsync()` switched locale without
loading anything — leaving an app that looked cleared and stayed cleared.

A scopeless clear now drops content and keeps intent, so both calls work again. What changed:

- `clearTranslations()` leaves `getActiveNamespaces()` untouched. Naming a namespace,
  `clearTranslations(undefined, "admin")`, still deactivates it — that is unchanged, and it remains
  the way to stop serving a namespace.
- `reloadTranslations()` on a host with no active namespace left reloads the default namespace and
  says so in a development warning, rather than resolving as a no-op.

If you relied on a scopeless `clearTranslations()` to deactivate namespaces, clear them by name
instead.
