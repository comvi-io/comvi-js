---
"@comvi/react": minor
---

`<I18nProvider>` takes a `messages` prop whose catalogs the children translate from at once and that is added to the i18n instance at commit, and `targetLocale` is now derived state keyed by the i18n instance, so a render React abandons never leaves a handover or a catalog behind.
