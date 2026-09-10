---
"@comvi/plugin-in-context-editor": patch
---

`window.__COMVI__` adoption is validated before it is trusted, and colliding instance ids no
longer lose an instance.

`ensureComviHook()` adopts an existing global as an already-installed hook only when it
carries the required members (`push`, `remove` and an `instances` Map) alongside the
`__comviEditorHook` marker, and it probes `Array.isArray` before the marker. The marker alone
is page-writable data: an object carrying only the marker made the editor read members that
do not exist, and a page that pollutes `Object.prototype.__comviEditorHook` did the same to a
legitimate queue array. Such a global is now treated as whatever it otherwise looks like, so
`activate()` reports no instance instead of throwing. The queue envelope's `i` is read as an
own property, so a polluted `Object.prototype.i` can no longer get a page-chosen object
tracked as the i18n instance.

Two instances announcing the same id are both kept: the second is tracked under a deduped id
(`<id>#<n>`, warned about in the console), and `remove()` / `unregister()` drop a slot only
while it still holds that instance, so destroying one instance can no longer evict the other.
