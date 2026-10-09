---
"@comvi/core": patch
---

`clearMessages()` followed by `reloadMessages()` now refetches, instead of quietly doing
nothing.

This is the editor-save and webhook-refresh flow: drop everything, fetch it again. A scopeless
`clearMessages()` used to clear the active namespace set along with the catalogs, so the instance
no longer knew what it had been serving. `reloadMessages()` then had nothing to reload and
resolved without a single request, and a following `setLocale()` switched locale without
loading anything — leaving an app that looked cleared and stayed cleared.

A scopeless clear now drops content and keeps intent, so both calls work again. What changed:

- `clearMessages()` leaves `getActiveNamespaces()` untouched.
- `reloadMessages()` on an instance with no active namespace left reloads the default namespace and
  says so in a development warning, rather than resolving as a no-op.

If you relied on a scopeless `clearMessages()` to deactivate namespaces, call
`removeActiveNamespace(ns)` instead — no form of the clear deactivates any more.
