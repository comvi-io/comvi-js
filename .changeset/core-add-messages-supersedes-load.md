---
"@comvi/core": patch
---

`addMessages()` now invalidates a pending load for the same locale and namespace, so an older loader response can no longer replace the merged catalog or emit a late `namespaceLoaded`.
