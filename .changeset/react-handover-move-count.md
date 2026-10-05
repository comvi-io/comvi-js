---
"@comvi/react": patch
---

`<I18nProvider>` ends a `targetLocale` handover on any change of the i18n instance's locale, even one no render of the provider saw, and merges `messages` keys that name the same catalog (`en` and `en:default`) key by key, as `addMessages` does, without inheriting `Object.prototype` names as translations.
