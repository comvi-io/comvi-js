---
"@comvi/nuxt": patch
---

Locale-routing fixes.

`useLocalePath()` (and `<NuxtLinkLocale>`, which routes its `to` through it) no longer prefixes a
target that is not an app-internal path: `https://example.com/a` came back as
`/de/https://example.com/a`, `mailto:` and `tel:` links broke the same way, and a bare
`?tab=billing` or `#details` jumped to the locale root instead of staying on the current page.
Those forms are now returned as written. A route object whose own `path` is external is answered
without consulting the router — vue-router resolves such a path relative to the current route,
which produced `/en/https://example.com/a` — and the object's `query` and `hash` are written onto
it in URL order. A route object carrying only `query`/`hash` is still a vue-router location: it
resolves against the current route, so `/en/pricing` with `{ query: { a: "b" } }` and locale `de`
gives `/de/pricing?a=b`, keeping the page the caller is on.

`useLocalePath()` and `useSwitchLocalePath()` no longer emit a protocol-relative path when
stripping the locale prefix leaves a doubled slash: `/en//evil.com` resolved to `//evil.com`, an
off-site link. The leading slash run is collapsed; interior slashes are untouched.

Accept-Language detection no longer selects a language the client refused with `q=0`. A request
sending `uk;q=0` was redirected to `/uk` by the route middleware, and `useTranslation()` served
that locale on the server.

Localized route clones now localize `alias` and `redirect`. A page `/legacy` with
`alias: ["/old", "/archive"]` and `redirect: "/new"` produced a `/de/legacy` clone that still
answered on the unprefixed aliases — even under `localePrefix: "always"`, where the unlocalized
records are removed — and still redirected out of the locale. A locale prefix the alias or
redirect already carries is replaced rather than stacked, so `/de/already` cloned for `en` is
`/en/already`, not `/en/de/already`. External and protocol-relative targets, relative child
aliases and function redirects are left untouched; a `name` redirect is retargeted at the clone of
the same locale when a cloned page defines that name.

`useLocaleRoute()` returns `undefined` for an off-site target instead of a route record that
matches nothing: an external or protocol-relative URL resolved to a record whose path was the URL
glued onto the current route, such as `/en/https://example.com/a`. Use `useLocalePath()` when you
want the href itself.
