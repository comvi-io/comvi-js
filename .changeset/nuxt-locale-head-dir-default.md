---
"@comvi/nuxt": patch
---

`useLocaleHead` now writes `<html dir>` for locales that declare none, using the locale's text
direction; previously the attribute was omitted.

`addDir` defaults to `true` and a locale object's `dir` is documented as defaulting to `"ltr"`,
but the composable emitted the attribute only when the locale object itself carried one. An app
configured the way the docs open it — `locales: ["en", "de"]`, or objects with `code` and `name`
— therefore shipped `<html>` with no direction at all, and an Arabic locale rendered LTR unless
its author had remembered `dir: "rtl"`. The value now falls back to `getTextDirection(locale)`
from `@comvi/core`, which is a pure function of the locale string. A declared `dir` still wins,
including when it disagrees with the language, and `addDir: false` still omits the attribute.
