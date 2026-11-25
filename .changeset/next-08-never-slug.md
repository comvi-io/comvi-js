---
"@comvi/next": minor
---

With `localePrefix: "never"` and `pathnames`, a localized slug that belongs to exactly one locale now names that locale: `/ueber-uns` (the `de` slug of `/about`) answers in German to a visitor without a locale cookie, where it used to redirect to `/about` in the default locale or in the `Accept-Language` locale. The slug ranks just before `accept-language` in `localeDetection.order` (last when `accept-language` is not in it), so `detectLocale`, a locale prefix in the path, `query`, the cookie and `header` still win; with `localeDetection: false` the slug decides. The `pathnames` key (`/about`), a slug two locales share and a slug equal to another page's key name no locale and behave as before. The `canonical` that `getAlternates` returns under `never` for a locale with its own slug therefore answers in that locale to a client that sends no preference. `as-needed` and `always` are unchanged.
