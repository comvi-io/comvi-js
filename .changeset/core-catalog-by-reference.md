---
"@comvi/core": minor
---

Keep flat plain-object catalogs by reference instead of copying them. A catalog passed to `messages`, `addMessages()` or returned by a loader is eligible when every leaf is a string and its prototype is either null or exactly `Object.prototype` — the latter only while `Object.prototype` itself carries no enumerable key. It is validated with one pass over its enumerable keys and then stored as the object you passed. Everything else (a nested value, a non-string leaf, any other prototype, or a polluted `Object.prototype`) is still flattened into a fresh null-prototype copy.

Comvi never writes your catalog object, and `getMessages()` returns that same object until an `addMessages()` merges into that locale and namespace: a merge builds a fresh null-prototype object, so identity holds for the first adoption only. Your later edits to it are read by `t()` without a `namespaceLoaded` or `configChanged` event: use `addMessages()` when bindings must be notified, and pass a copy when you want the instance isolated from later edits.

A lookup value is a translation only if it is a non-empty string. Members inherited from `Object.prototype` (`constructor`, `toString`, `__proto__`) therefore never resolve, while an own string property under such a key does.

Outside the supported catalog shape: non-enumerable own properties, accessor properties, Proxies and symbol keys (a lookup may see what SSR serialization omits). Enumerable keys added to `Object.prototype` after a catalog was ingested are not guarded against.
