---
"@comvi/plugin-in-context-editor": minor
---

**BREAKING (breaking change on a 0.x minor): the raw plugin factory is renamed `InContextEditorPlugin` → `inContextEditorPlugin`.** This package already spelled the suffix; what it did not do is match the casing of its three siblings, so the four first-party factories now read the same way — `inContextEditorPlugin` beside the `inContextEditor` installer, as `fetchLoaderPlugin` sits beside `fetchLoader`.

```diff
-import { InContextEditorPlugin } from "@comvi/plugin-in-context-editor";
+import { inContextEditorPlugin } from "@comvi/plugin-in-context-editor";

-i18n.registerPlugin(InContextEditorPlugin({ debug: true }));
+i18n.registerPlugin(inContextEditorPlugin({ debug: true }));
```

Both export conditions are renamed — the default entry and the `production` no-op — and so is the property on the standalone bundle's global: `window.ComviInContextEditor.inContextEditorPlugin`. The `inContextEditor` installer, `EditorOptions`, `InContextEditorInstaller` and every other export keep their names, and behaviour is unchanged. The old names are removed, with no deprecated aliases.
