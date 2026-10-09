---
"@comvi/plugin-locale-detector": patch
---

**The locale detector warns in development when it has no `supportedLocales`.** Without the list
(and without `convertDetectedLocale`) any language the browser reports becomes the active locale
and is cached, including one the app has no translations for; `init()` then fails for that
visitor on every later visit. Development builds now say so once, when the plugin starts, and
name the option.

The package gains a development artifact for this, `dist/index.dev.js`, behind the `development`
export condition, the same split `@comvi/core` and `@comvi/vue` have. The default artifact is
byte-identical to the previous one: the check and its text exist only in the development file.
Runtime behaviour is unchanged in both.
