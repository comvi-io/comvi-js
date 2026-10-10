---
"@comvi/plugin-in-context-editor": patch
---

`window.__COMVI__` adoption is validated before it is trusted, and colliding instance ids no
longer lose an instance.

`ensureComviHook()` adopts an existing global as an already-installed hook only when it
carries every member this package then uses on it (`push`, `remove`, `get` and an `instances`
Map) alongside the `__comviEditorHook` marker, and it probes `Array.isArray` before the
marker. The marker alone is page-writable data: an object carrying only the marker made the
editor read members that do not exist, and a page that pollutes
`Object.prototype.__comviEditorHook` did the same to a legitimate queue array. Such a global
is now treated as whatever it otherwise looks like, a v1 registry when it duck-types as one
and an untouched foreign value otherwise, so `activate()` reports no instance instead of
throwing. The queue envelope's `i` is read as an own property, so a polluted
`Object.prototype.i` can no longer get a page-chosen object tracked as the i18n instance.

Two instances announcing the same id are both kept: the later one is tracked under
`<id>#<n>`, with a console warning naming both keys. `get(id)` still resolves such an
instance by the id it announced while that is unambiguous, falling back to the single
suffixed entry when nothing holds the exact key. `remove()` drops a slot only while it still
holds that instance, and `unregister(id)` resolves the instance that claimed the id through
`register(id, instance)` before falling back to the current holder, so neither can evict a
different live instance.
