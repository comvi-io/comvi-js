---
"@comvi/react": patch
---

`<I18nProvider>` ends a `targetLocale` handover on any move of the i18n instance's locale, even one whose render React discards or batches away, and merges `messages` keys that name the same catalog (`en` and `en:default`) key by key, as `addMessages` does.
