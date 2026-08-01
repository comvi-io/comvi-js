---
"@comvi/solid": patch
---

`<T>` internals now consume the shared `prepareTranslation` pipeline from `@comvi/core/tags` instead of a package-local marker transport. Public props and rendering behavior are unchanged (lazy fallback-children resolution, fine-grained no-params `tRaw` fast path, string/component/`{ tag, props }` handler forms, error reporting on throwing handlers).

Faithful-superset details:

- Missing-translation detection now honors `params.locale`/`params.ns` when no explicit `locale`/`ns` prop is set. With no reserved params it behaves exactly as before.
- `component` is now accepted as an alias for `tag` in the `{ tag | component: target, props }` mapping form (shared vue convention; previously ignored).
- Tag interpolation inside `<T>` no longer depends on ambient tag-syntax registration when params, components, or reserved props are present: the tag extension is passed per call. The bare no-params fast path keeps relying on the module's ambient `import "@comvi/core/tags"` registration (see handoff note).
