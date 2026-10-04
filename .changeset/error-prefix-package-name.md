---
"@comvi/core": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/next": patch
"@comvi/plugin-fetch-loader": patch
"@comvi/plugin-in-context-editor": patch
"@comvi/cli": patch
---

**Every runtime message opens with the name of the package whose code wrote it.** `[i18n]` and `[comvi]` become `[@comvi/core]` in core, `[@comvi/react]` and `[@comvi/vue]` in those bindings, and `[@comvi/next]` on next's `.use()` identity error; the in-context editor's `[ComviInContextEditor]`, `[InContextEditor]`, `[ElementHighlighter]` and `[comvi]` become `[@comvi/plugin-in-context-editor]`, and the CLI's `[comvi]` becomes `[@comvi/cli]`. A core message surfaced through a binding keeps `[@comvi/core]`. The sentence after the prefix is unchanged, except that a few messages that had no prefix gain one: core's plugin-initialization timeout and failure and its missing-tag-handler report, react's non-element tag handler error, the fetch loader's project-info, API, CDN HTTP and timeout errors, and the editor's console diagnostics. Production error codes such as `E_ICU_SYNTAX` are unchanged.
