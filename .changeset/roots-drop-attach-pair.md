---
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/vue": minor
"@comvi/next": minor
---

**BREAKING (breaking change on a 0.x minor): the `attachPlugins` / `attachDevtools` low-level pair is no longer re-exported
from `@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`, or the `@comvi/next`
`client`/`server`/root entries.** They were synonyms for what `plugins()` / `devtools()`
already configure, so a binding user now sees exactly `loader`, `attachLoader`, `plugins`,
`devtools`, `definePlugin` on the root — the everyday toolkit. The advanced pair still
lives on `@comvi/core/plugins` and `@comvi/core/devtools` for anyone composing a bare
`.use(attachPlugins)` / `.use(attachDevtools)` directly:

```diff
-import { attachPlugins, attachDevtools } from "@comvi/react";
+import { attachPlugins } from "@comvi/core/plugins";
+import { attachDevtools } from "@comvi/core/devtools";
```
