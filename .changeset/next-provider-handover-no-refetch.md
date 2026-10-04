---
"@comvi/next": patch
---

`<I18nProvider>` now adds the catalog the server handed over before it switches the locale, on the first mount and on every navigation, so the browser never re-fetches that catalog and the translated text commits in the same render as the new `<html lang>`.
