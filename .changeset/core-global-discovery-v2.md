---
"@comvi/core": minor
---

`window.__COMVI__` discovery protocol v2 (queue-hook). The v1 global registry object (`version`/`instances`/`register`/`unregister`/`get` + the `COMVI_READY` CustomEvent) is gone. Every instance created with `exposeGlobal` now pushes a `{ v: version, i: instance }` envelope onto a plain queue array at `window.__COMVI__` (installing the array when the slot is empty); consumers such as the in-context editor drain that array and swap in a hook object (`push`/`remove`) to receive later instances. `destroy()` removes the instance's own entry (identity-based: hook `remove`, or array splice).

Mixed-version pages stay safe: new core detects a v1 legacy registry (`register` without `remove`) and falls back to `register(id, instance)`, and it never clobbers a truthy non-conforming global. The one **unsupported pairing is old extension + new core** — an old in-context-editor/Chrome-extension build never drains the queue array, so it will not see instances from this version onward; update the extension to the dual-protocol version first (see release notes for the minimum extension version).

Migration: anything reading `window.__COMVI__.instances` or listening for `COMVI_READY` directly must move to draining the queue array (and swapping in a `push`/`remove` hook for live updates). The exported `ComviGlobal` type is replaced by `ComviQueueEntry`, `ComviHook`, and `ComviQueue`. The full contract, probe order, and version-pairing matrix live in `contracts/chrome-extension-proxy.json` (contract version 2).
