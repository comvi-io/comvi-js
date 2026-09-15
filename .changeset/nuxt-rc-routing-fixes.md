---
"@comvi/nuxt": patch
---

Three locale-routing fixes.

`useLocalePath()` (and `<NuxtLinkLocale>`, which routes its `to` through it) no longer prefixes a
target that is not an app-internal path: `https://example.com/a` came back as
`/de/https://example.com/a`, `mailto:` and `tel:` links broke the same way, and a bare
`?tab=billing` or `#details` jumped to the locale root instead of staying on the current page.
Those forms are now returned as written; a route object's own `path` obeys the same rule, while an
object carrying only `query`/`hash` is still localized.

Accept-Language detection no longer selects a language the client refused with `q=0`. A request
sending `uk;q=0` was redirected to `/uk` by the route middleware, and `useTranslation()` served
that locale on the server.

Localized route clones now localize `alias` and `redirect`. A page `/legacy` with
`alias: ["/old", "/archive"]` and `redirect: "/new"` produced a `/de/legacy` clone that still
answered on the unprefixed aliases — even under `localePrefix: "always"`, where the unlocalized
records are removed — and still redirected out of the locale. External and protocol-relative
targets, relative child aliases and function redirects are left untouched; a `name` redirect is
retargeted at the clone of the same locale when a cloned page defines that name.
