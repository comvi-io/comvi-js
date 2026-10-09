---
"@comvi/plugin-in-context-editor": patch
---

`createI18n({ collectContext: false })` is honoured on the composed plugin path.

The option on the i18n instance is the single developer-level opt-out: the plugin option can
narrow collection, never re-enable it. `standalone.ts` (the extension path) already applied that
rule, but `inContextEditorPlugin()` read only its own option, so an app that opted out in
`createI18n` still had the context collector started as soon as the editor plugin was installed.

The composed path resolves the same way as standalone: `false` on the instance wins, otherwise the
plugin option decides, and leaving both unset keeps the default (collection on). On the extension
path the page reports the flag during activation, so a hostile page can report `true`; the
extension README describes that boundary.
