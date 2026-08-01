---
"@comvi/vue": minor
---

`<T>` now consumes the shared `prepareTranslation` pipeline from `@comvi/core/tags` instead of its own duplicated marker/transport code. Rendering, slots-as-handlers, the `components` prop (string, `{ component, props }` config, and Vue component forms), and reserved-prop forwarding all behave as before.

New behavior:

- **Default-slot fallback for missing translations.** When a key has no translation in the locale chain and no `fallback` prop is set, `<T i18nKey="maybe.missing">shown instead of the key</T>` now renders its default slot instead of the raw key — parity with the react/solid/svelte children fallback. Without a default slot the key still renders, and the `fallback` prop still wins over the slot.
- `hasTranslation`-based missing detection means the default slot is consulted only for genuinely missing keys; existing translations (including empty-tag and post-processed results) render exactly as before.

Also removes the package-local `translationResultToString` copy in favor of the identical export from `@comvi/core` (no observable change).
