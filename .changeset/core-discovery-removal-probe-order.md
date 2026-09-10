---
"@comvi/core": patch
---

`destroy()` now probes the `window.__COMVI__` global in the same order exposure does:
`Array.isArray` first, then a hook object's `remove`, then the v1 registry's `unregister`.
Consulting `remove` first meant that on a page which extends `Array.prototype` with a
`remove(index)` polyfill, a raw queue array was handed the entry OBJECT instead of being
spliced by identity: the polyfill coerced it to index 0 and dropped another instance's live
entry, with nothing thrown. A consumer hook that masquerades as an array is unaffected, its
own `remove` still receives the entry.
