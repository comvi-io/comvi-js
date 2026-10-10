---
"@comvi/plugin-in-context-editor": patch
---

`./standalone` now ships types; exports conditions reordered, no runtime change.

- **`./standalone` had no `types` condition.** The subpath mapped straight at
  `./dist/standalone.iife.js`, so `import { activate } from "@comvi/plugin-in-context-editor/standalone"`
  resolved to `any`. It now points at the `dist/standalone.d.ts` the build already emitted,
  which declares `activate`, `deactivate`, `isActive`, `getStatus` and the
  `window.ComviInContextEditor` global.
- **`types` now comes first in the `.` condition map**, matching `@comvi/core`. The
  per-condition declarations are kept by nesting them under it, so a `production` consumer still
  types against the no-op entry and everyone else against the full one. The runtime conditions
  are unchanged: `production` still resolves to `dist/production.es.js` and everything else to
  `dist/index.es.js`.
