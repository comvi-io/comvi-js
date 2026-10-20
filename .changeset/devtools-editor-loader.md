---
"@comvi/core": patch
---

`devtools()` installs a page-level editor loader the Comvi browser extension uses to load the in-context editor from jsDelivr; new `editorVersion` option pins the editor. The `EditorLoadResult` type declares `editorVersion`, `code` and `host` as always present, holding `undefined` where they do not apply.
