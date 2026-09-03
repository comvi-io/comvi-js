---
"@comvi/next": patch
---

**SSR correctness: `<I18nProvider>` no longer writes the shared i18n instance during a server
render.**

Your i18n instance is created once at module scope and shared by every request a Next.js server
process handles. The provider used to assign `i18n.locale = locale` while rendering, so two
requests for different locales that overlapped in the same process could read each other's locale:
the first request's tree would finish rendering against the second request's locale. On a busy
route that surfaced as pages served in the wrong language, and as hydration mismatches when the
markup and the client disagreed.

The locale assignment now happens on the client only, before the first commit. On the server the
request locale reaches the tree through React context, exactly as it already did for `t()`,
`<T>` and the formatters, so nothing about the rendered output changes for a single request.

`addTranslations()` still runs on the server. It is additive and keyed by `locale:namespace`, so a
concurrent request can only write what the other would have loaded anyway.
