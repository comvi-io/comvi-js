---
"@comvi/vite-plugin": patch
---

Internal: the ICU scanner that reads parameters out of translation values moved to the workspace-private typegen module, so other tools can share it. Generated types are unchanged for every message `@comvi/core` accepts. One change for messages core refuses: a `plural` or `selectordinal` explicit value outside core's grammar (`=x`, `=1e3`, `=.5`, `=+1`, `=Infinity`) now makes the key report the ICU issue and get no parameters, as `{price, number}` already did, instead of generating parameters for a key core rejects with `E_ICU_SYNTAX`.
