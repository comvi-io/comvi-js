---
"@comvi/nuxt": patch
---

A locale switch can return to the default locale under `localePrefix: "as-needed"`. `useSwitchLocalePath()` and `<NuxtLinkLocale locale>` produce the unprefixed URL for the default locale; the route middleware resolved the root path from the `i18n_locale` cookie, which still held the locale being left, and redirected straight back to `/de`.

The middleware now reads a navigation from a locale-prefixed URL to the same page without a prefix as a switch to the default locale: the URL decides, the root path included, and the cookie records the default locale. A clicked `<NuxtLinkLocale locale>` writes the cookie before it navigates, with the name and attributes `localeCookie` configures, so a link to another page in another locale lands in that locale too, under `"never"` as well.

A first visit without a cookie is detected as before, and a direct visit to `/` with a stored locale is still redirected to that locale.
