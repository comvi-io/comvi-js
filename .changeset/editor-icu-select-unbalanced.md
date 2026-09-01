---
"@comvi/plugin-in-context-editor": patch
---

`parseICUSelect` no longer drops the last character of a select arm whose closing brace is missing (`"{gender, select, male {He}"` now yields `{ male: "He" }`, not `{ male: "H" }`).
