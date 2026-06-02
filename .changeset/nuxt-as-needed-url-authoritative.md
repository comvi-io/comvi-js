---
"@comvi/nuxt": minor
---

**BREAKING:** In `localePrefix: "as-needed"` mode, a non-root path without a locale prefix now resolves to the default locale unconditionally. Previously the middleware consulted the cookie/`Accept-Language` first, which caused two visible problems:

- Switching back to the default locale from a non-default one would immediately bounce the user back via the cookie (e.g. on `/de/about` → switcher click on EN → `/about` → redirect to `/de/about`).
- Any direct navigation to an unprefixed page would honor a stale cookie instead of the URL.

The URL is now authoritative for non-root paths in `as-needed` mode. Cookie / `Accept-Language` detection still runs on the root path (`/`) so first-visit auto-detection continues to work as before. This matches `@nuxtjs/i18n`'s default `redirectOn: "root"` behavior.

**Cookie semantics:** the locale cookie now represents the user's persisted _preference_, not the last rendered locale. Passively navigating to a path-implied default URL (e.g. cookie `de`, user visits `/about`) renders the URL's locale but preserves the cookied preference, so a subsequent visit to `/` still redirects to `/de`. Language switchers must call `setLocale(target)` before `navigateTo(switchLocalePath(target))` so the explicit choice is recorded — the test apps in `test-apps/nuxt*` show the pattern.

No migration is required for typical setups. If you relied on cookie-driven redirects on arbitrary URLs, switch to `localePrefix: "always"` (every path carries a prefix) or handle the redirect explicitly in a route middleware.

Also drops the unused `packages/nuxt/playground` directory; the `dev` script now produces a stub build so the test apps in `test-apps/nuxt` and `test-apps/nuxt4` can drive the module live.
