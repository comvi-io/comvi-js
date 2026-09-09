---
"@comvi/plugin-in-context-editor": patch
---

`createI18n({ collectContext: false })` is now honoured on the composed plugin path.

The documented contract is that the host-level option is the single developer-level opt-out
and wins on both activation paths: the plugin option can narrow collection, never re-enable it.
`standalone.ts` (the extension path) already applied that rule, but `InContextEditorPlugin()`
read only its own option, so an app that opted out in `createI18n` still had the context
collector started as soon as the editor plugin was installed.

The composed path now resolves the same way as standalone: host `false` wins, otherwise the
plugin option decides, and leaving both unset keeps the default (collection on).
