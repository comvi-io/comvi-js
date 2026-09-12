---
"@comvi/vue": minor
---

`<T>` now takes interpolation params as plain attributes, the way `@comvi/react`'s `<T>` always
has.

```vue
<T i18nKey="cart.items" :count="2" name="Ada" />
```

Anything that is not one of `<T>`'s own props (`i18nKey`, `params`, `ns`, `locale`, `fallback`,
`raw`, `skipPostProcess`, `components`) is passed to the translation as a param, so a one-value message no longer
needs a `:params="{ … }"` object. `params` still works and can be combined with attributes; on a
name collision the attribute wins, matching react.

Write direct params in **camelCase**: Vue camelizes declared props only, so `:max-count="2"`
arrives as a param named `max-count`, while `:maxCount="2"` arrives as `maxCount`.

The component now sets `inheritAttrs: false`, so an attribute is never also written onto the
rendered markup — and Vue no longer logs "Extraneous non-props attributes" for a `<T>` that
renders text or a fragment. That includes `class`, `style` and `v-on` listeners: they are
attributes, so on `<T>` they become translation params rather than reaching the markup. Put them
on an element around `<T>` instead.
