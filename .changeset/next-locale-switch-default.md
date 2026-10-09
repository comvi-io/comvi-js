---
"@comvi/next": patch
---

A locale switch can return to the default locale under `localePrefix: "as-needed"`, and switches at all under `"never"`. `useLocalizedRouter().push(href, locale)` / `.replace(href, locale)` and `<Link locale>` produced the unprefixed URL for the default locale; the middleware resolved that URL from the `NEXT_LOCALE` cookie, which still held the locale being left, and redirected straight back.

A navigation that names another locale than the current one now goes to the locale-prefixed URL (`/en/about`), which the middleware reads as an explicit choice: it records the locale in the cookie and redirects to the public URL (`/about`). The switch also writes the cookie in the browser, with the name and attributes `localeCookie` configures, because Next answers a cached navigation without a request. `<Link>` to another locale is no longer prefetched: the prefetch went through the middleware and moved the cookie to that locale without a click.

A first visit without a cookie is detected as before, and a direct visit to an unprefixed URL with a stored locale is still redirected to that locale.

The middleware now writes the locale cookie for a page the browser loads (`Sec-Fetch-Dest: document`, or a request without that header) and for a redirect away from a locale-prefixed URL, and no longer for the other fetches Next's client router makes. Next 16 re-prefetches the links of the page being left, and recording those moved the cookie back to the locale just switched away from. `useLocalizedRouter()` and `<Link locale>` record a switch in the browser, without a `routing` prop too (in `NEXT_LOCALE`). A client navigation through a plain `next/link` to another locale's URL is recorded at the next page load of that locale.

`<I18nProvider routing>` keeps the public URL in the address bar: Next 16 answers a repeated switch from its client cache and left `/en/about` standing where the middleware redirects to `/about`.
