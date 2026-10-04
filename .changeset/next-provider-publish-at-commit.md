---
"@comvi/next": patch
---

`<I18nProvider>` no longer writes the i18n instance during render: it passes `messages` to the React provider, applies the locale at commit, and renders a locale outside `routing.locales` in the i18n instance's locale on the server too.
