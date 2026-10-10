---
"@comvi/react": patch
---

`useI18n().hasTranslation()` now defaults to the locale the component is rendering in, instead of
whatever locale the i18n instance currently carries.

`t()`, `tRaw()` and the formatters already resolved against the render-time locale from
`<I18nProvider>`; `hasTranslation` was bound straight to the instance and did not. Under a
server-rendered provider that meant it answered for the instance's configured locale, so a guard like
`hasTranslation("cta") ? t("cta") : null` could hide a string that `t()` would have rendered.

Pass an explicit locale as the second argument to check a different one, as before.
