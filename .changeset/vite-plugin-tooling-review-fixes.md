---
"@comvi/vite-plugin": patch
---

Declarations are written atomically and an identical regeneration after a failed write now writes the file. Keys named `__proto__`, `constructor` or `prototype` are kept, and an `augment` option that is not a module specifier is refused.
