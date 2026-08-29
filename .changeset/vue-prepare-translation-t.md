---
"@comvi/vue": minor
---

`<T>` now consumes the shared `prepareTranslation` pipeline from the pure `@comvi/core/rich-text` seam instead of its own duplicated marker/transport code. Rendering, slots-as-handlers, the `components` prop (string, `{ component, props }` config, and Vue component forms), and reserved-prop forwarding all behave as before.

New behavior:

- **Default-slot fallback for missing translations.** When a key has no translation in the locale chain and no `fallback` prop is set, `<T i18nKey="maybe.missing">shown instead of the key</T>` now renders its default slot instead of the raw key — parity with the react/solid/svelte children fallback. Without a default slot the key still renders, and the `fallback` prop still wins over the slot.
- `hasTranslation`-based missing detection means the default slot is consulted only for genuinely missing keys; existing translations (including empty-tag and post-processed results) render exactly as before.

The seam itself changed during the release. `<T>` first took the shared pipeline from `@comvi/core/tags`, the side-effectful subpath, which meant that rendering `<T>` anywhere in a vue app also switched string-API tag syntax on for every plain `t()` call — and switched it off again in any production build that pruned the component. The vue convergence moved the import to the pure entry, which re-exports the same toolbox and registers nothing: tag interpolation inside `<T>` is unchanged, because `prepareTranslation` passes the tag extension per call, while `t("a <b>c</b> d")` is now consistently literal until the app imports `@comvi/core/tags` itself. No module in `@comvi/vue` names that subpath any more.

Also removes the package-local `translationResultToString` copy in favor of the identical export from `@comvi/core` (no observable change).
