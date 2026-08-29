---
"@comvi/solid": minor
---

`<T>` internals now consume the shared `prepareTranslation` pipeline from the pure `@comvi/core/rich-text` seam instead of a package-local marker transport. Public props and rendering behavior are unchanged (lazy fallback-children resolution, fine-grained no-params `tRaw` fast path, string/component/`{ tag, props }` handler forms, error reporting on throwing handlers). The ambient `@comvi/core/tags` entry re-exports the same toolbox but is not part of the Solid graph.

Faithful-superset details:

- Missing-translation detection now honors `params.locale`/`params.ns` when no explicit `locale`/`ns` prop is set. With no reserved params it behaves exactly as before.
- `component` is now accepted as an alias for `tag` in the `{ tag | component: target, props }` mapping form (shared vue convention; previously ignored).
- Tag interpolation inside `<T>` no longer depends on ambient tag-syntax registration in ANY shape: the tag extension is passed per call. The bare no-params fast path used to rely on this module's own `import "@comvi/core/tags"`, which is gone — it now takes the fast path only for a resolved string with no `<` in it, and routes markup through `prepareTranslation` like every other shape. Plain text, the overwhelmingly common case, keeps the zero-allocation static-template cache hit; a bare `<T>` over a tag-bearing template renders exactly the same rich text it did before, and importing or rendering `<T>` no longer changes what plain string-API `t()` does with `<tag>` markup.
