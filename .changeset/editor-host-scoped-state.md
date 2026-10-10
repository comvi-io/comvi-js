---
"@comvi/plugin-in-context-editor": patch
---

Each server-side instance now keeps its own key-id map, the mappings bridge stays until the last editor runtime on an instance is torn down, and stopping one editor instance no longer closes UI another active instance opened.
