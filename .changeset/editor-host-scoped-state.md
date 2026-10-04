---
"@comvi/plugin-in-context-editor": patch
---

Each server host now keeps its own key-id map, the mappings bridge stays until the last editor runtime on a host is torn down, and stopping one editor instance no longer closes UI another active instance opened.
