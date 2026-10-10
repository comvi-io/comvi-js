---
"@comvi/react": minor
---

`<T>` internals now consume the shared `prepareTranslation` pipeline from the pure
`@comvi/core/rich-text` seam instead of a package-local marker transport. Public props and
rendering behaviour are unchanged (typed-prop API, direct-prop params, children-as-fallback,
element/function handlers, error reporting on throwing handlers).

Faithful-superset details:

- Missing-translation detection now honours `params.locale` / `params.ns` when no explicit
  `locale` / `ns` prop is set; previously the lookup always used the current render locale
  and default namespace. With no reserved params it behaves exactly as before.
- `components` entries in the shared `{ tag | component: target, props }` config form are
  now understood; such entries used to be silently ignored, rendering the tag as its inner
  text. The documented `string | ReactElement | function` handler forms are untouched.
- Tag interpolation inside `<T>` no longer depends on ambient tag-syntax registration: the
  tag extension is passed per call.
