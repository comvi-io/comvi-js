---
"@comvi/react": patch
---

`<T>` internals now consume the shared `prepareTranslation` pipeline from `@comvi/core/tags` instead of a package-local marker transport. Public props and rendering behavior are unchanged (typed-prop API, direct-prop params, children-as-fallback, element/function handlers, error reporting on throwing handlers).

Faithful-superset details:

- Missing-translation detection now honors `params.locale`/`params.ns` when no explicit `locale`/`ns` prop is set (previously the lookup always used the current render locale/default namespace). With no reserved params it behaves exactly as before.
- `components` entries in the shared `{ tag | component: target, props }` config form are now understood (previously such entries were silently ignored and the tag rendered as its inner text). The documented `string | ReactElement | function` handler forms are untouched.
- Tag interpolation inside `<T>` no longer depends on ambient tag-syntax registration: the tag extension is passed per call.
