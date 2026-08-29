---
"@comvi/core": minor
---

**`window.__COMVI__` discovery protocol v2.** The v1 registry object
(`version` / `instances` / `register` / `unregister` / `get`, plus the `COMVI_READY` event)
is gone, and announcing is a capability now rather than a constructor behaviour.

A host that composed discovery — `.with(devtools({ exposeGlobal }))`, the lower-level
`attachDevtools`, or `.with(inContextEditor())` under the editor package's development
entry — pushes a `{ v: version, i: instance }` envelope onto a plain queue array at
`window.__COMVI__`, installing the array when the slot is empty. A host that never composes
it reads `instanceId` as `undefined`, touches no global at all, and is invisible to the
browser extension. Consumers such as the in-context editor drain that array and swap in a
hook object (`push` / `remove`) to receive later instances; `destroy()` removes the
instance's own entry.

**The minimum extension version is 0.5.0.** New core detects a v1 legacy registry and falls
back to it, and never clobbers a truthy non-conforming global — but an old extension build
never drains the queue array, so **old extension + new core is the one unsupported
pairing**. Ship the dual-protocol extension and let it propagate first.

Migration: anything that read `window.__COMVI__.instances` or listened for `COMVI_READY`
must drain the queue array instead, swapping in a `push` / `remove` hook for live updates.
The exported `ComviGlobal` type is replaced by `ComviQueueEntry`, `ComviHook` and
`ComviQueue`.
