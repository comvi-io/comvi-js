---
"@comvi/core": patch
---

Reading an exact plural selector (`=1`, `=1.5`, `=1e3`) takes time linear in its length. A long run of digits followed by a stray character (`=111…1x`) took time quadratic in its length before it was rejected: 40,000 digits took seconds. The selectors that are accepted, and the number each one names, are unchanged.
