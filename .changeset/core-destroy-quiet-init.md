---
"@comvi/core": patch
---

A plugin or locale detector that rejects after `destroy()` no longer rejects or reports the interrupted `init()`, which now resolves quietly as it does for any mid-init teardown.
