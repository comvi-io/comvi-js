---
"@comvi/plugin-in-context-editor": minor
---

The standalone runtime now speaks discovery protocol v2: on boot (and again on `activate()`) it drain-and-swaps `window.__COMVI__` — snapshot the queue array, swap in a dual-protocol hook object FIRST, then drain the snapshot (`{v, i}` envelopes and bare legacy instances). The hook implements both protocols: v2 `push`/`remove` for new core, and the v1 legacy surface (`register`/`unregister`/`get`/`instances`) so an OLD `@comvi/core` landing on a page where the new editor already swapped still attaches. A pre-existing v1 registry object is drained via its `instances` map (with a `COMVI_READY` shim for stragglers); a truthy non-conforming global is left untouched. `getStatus()` reports version/instance counts from whichever shape currently occupies the global.
