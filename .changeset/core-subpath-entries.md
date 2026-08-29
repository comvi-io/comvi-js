---
"@comvi/core": minor
---

New subpath entries decompose the core, so an app pays only for what it composes:

- `@comvi/core` — `createI18n` with the simple `{param}` compiler only; the `compiler`
  option injects ICU per instance.
- `@comvi/core/icu` — pure: `icuCompiler` (its only public home) and the `icu()` installer.
- `@comvi/core/tags` — the tag-interpolation toolbox. **Importing it registers tag syntax
  ambiently**, so string-API `t()` parses `<tag>…</tag>` everywhere. Also exports
  `registerTagSyntax()` (returns a disposer), `tagSyntaxExtension` for per-call activation,
  and the VirtualNode helpers.
- `@comvi/core/loader` — pure: `attachLoader` / `loader()`, `createImportMapLoader`,
  `flattenCatalog` and the loader types.
- `@comvi/core/plugins` — pure: `attachPlugins` and the plugin types.
- `@comvi/core/devtools` — pure: `attachDevtools(i18n, { instanceId, exposeGlobal })`.
- `@comvi/core/rich-text` — the pure `<T>` toolbox; `@comvi/core/editor-bridge` — the
  in-context-editor contract module.

Async loading and plugin registration are not on a base instance: they are absent from the
module graph, not disabled by a flag, so TypeScript reports their use as a compile error
rather than letting it fail at runtime. Compose them back with `attachLoader` /
`attachPlugins` (idempotent, installing **non-enumerable own properties**, so
`Object.keys()`, spread copies and `JSON.stringify` are unaffected). Three members moved off
the base surface into `@comvi/core/loader`, where the only code that can exercise them
lives: `addActiveNamespace`, `addActiveNamespaces` and `onLoadError`.
`createImportMapLoader` moved there too.

Tag activation is dual-channel: ambient registration via import, or per call through
`tagInterpolation.extensions` — the ordering-proof channel `<T>` uses, immune to bundler
side-effect stripping. `sideEffects` changed from `false` to an array naming exactly the
tag-registering modules, so everything else still prunes. The template cache keys on
compiler identity and the effective syntax-extension set, so hosts with different compilers
in one process never poison each other.

**Scope note:** the base host is what every framework binding runs on in this release — all
six accept `WrapperI18nHost`, so a binding's own graph no longer drags ambient tag
registration into your bundle. The price is that the loader/plugin members left `useI18n()`
for `useI18nLoader()` / `useI18nPlugins()`; see each binding's own entry.
