---
"@comvi/core": minor
"@comvi/plugin-in-context-editor": patch
"@comvi/nuxt": patch
---

New `@comvi/core/editor-bridge` subpath: the typed contract for the in-context editor mappings bridge, previously hand-copied in two places. It exports `EDITOR_MAPPINGS_GLOBAL` / `EDITOR_INITIAL_MAPPINGS_GLOBAL` (the host property keys), the `InContextEditorMappings` interface, the `toRecordOfNumbers()` payload validator, and the `readEditorMappings(host)` guard. The module is pure (types + two small helpers, no side effects) and invisible to non-importers.

`@comvi/plugin-in-context-editor` and `@comvi/nuxt` now consume this shared contract instead of their local copies — no behavior change; SSR key-mapping transfer between the editor plugin and the Nuxt runtime works exactly as before, but the property keys and bridge shape can no longer drift apart.
