---
"@comvi/core": patch
---

Keep flat plain-object catalogs by reference instead of copying them. A catalog passed to `messages`, `addMessages()` or returned by a loader is eligible when its prototype is exactly `Object.prototype` and every own enumerable value is a string. It is validated with one pass over its enumerable keys and then stored as the object you passed. Other catalogs (nested, with non-string values, or with another prototype) are still flattened into a new object.

Comvi never writes your catalog object, and `getMessages()` returns that same object. Your later edits to it are read by `t()` without a `namespaceLoaded` or `configChanged` event: use `addMessages()` when bindings must be notified, and pass a copy when you want the instance isolated from later edits.

A lookup value is a translation only if it is a non-empty string. Members inherited from `Object.prototype` (`constructor`, `toString`, `__proto__`) therefore never resolve, while an own string property under such a key does.

Outside the supported catalog shape: non-enumerable own properties, accessor properties, Proxies and symbol keys (a lookup may see what SSR serialization omits). Enumerable keys added to `Object.prototype` after a catalog was ingested are not guarded against.
