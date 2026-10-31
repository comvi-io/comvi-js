---
"@comvi/react": patch
---

`<T components={{ br: "br" }}>` renders `<br/>`. An empty tag passes no children through `components`, so a void element (`br`, `hr`) no longer throws, as in `@comvi/vue`. A component on an empty tag gets `children` `undefined`, not an empty Fragment.
