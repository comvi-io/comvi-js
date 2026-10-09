---
"@comvi/plugin-in-context-editor": patch
---

Context collection sends nothing on `pagehide` after the editor stops, or after a collection pass fails and turns collection off. Its `pagehide` listener is removed even when teardown itself fails, and stopping twice sends the final pass only once.
