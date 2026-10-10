---
"@comvi/vue": minor
---

`<T>` now consumes the shared `prepareTranslation` pipeline from the pure
`@comvi/core/rich-text` seam instead of its own duplicated marker transport. Rendering,
slots-as-handlers, the `components` prop (string, `{ component, props }` config, and Vue
component forms) and reserved-prop forwarding all behave as before.

**New: a default-slot fallback for missing translations.** When a key has no translation in
the locale chain and no `fallback` prop is set,
`<T i18nKey="maybe.missing">shown instead of the key</T>` renders its default slot instead
of the raw key — parity with the react / solid / svelte children fallback. Without a default
slot the key still renders, and the `fallback` prop still wins over the slot.
`hasTranslation`-based detection means the slot is consulted only for genuinely missing
keys.

The seam matters: `<T>` first took the shared pipeline from `@comvi/core/tags`, the
side-effectful subpath, so rendering `<T>` anywhere also switched string-API tag syntax on
for every plain `t()` call — and off again in any production build that pruned the
component. The pure entry re-exports the same toolbox and registers nothing, so tag
interpolation inside `<T>` is unchanged while `t("a <b>c</b> d")` is consistently literal
until the app imports `@comvi/core/tags` itself.

Also removes the package-local `translationResultToString` copy in favour of the identical
export from `@comvi/core`.
