---
"@comvi/react": patch
---

`<T>` now renders a function tag handler as a React component, so a handler that uses hooks keeps working when a translation gains or loses that tag. The "must return a React element" error is gone; a handler returning `null` renders nothing, like any component; strings, numbers and arrays are accepted as React nodes.
