---
"@comvi/plugin-in-context-editor": minor
---

The standalone runtime speaks discovery protocol v2. On boot, and again on `activate()`, it
drain-and-swaps `window.__COMVI__`: it snapshots the queue array, swaps in a dual-protocol
hook object first, then drains the snapshot. The hook implements both protocols — v2
`push` / `remove` for new core, and the v1 surface (`register` / `unregister` / `get` /
`instances`) so an OLD `@comvi/core` landing on a page where the new editor already swapped
still attaches. A pre-existing v1 registry object is drained via its `instances` map, and a
truthy non-conforming global is left untouched. `getStatus()` reports version and instance
counts from whichever shape currently occupies the global.
