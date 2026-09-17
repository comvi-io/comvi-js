---
"@comvi/next": patch
---

`await getI18n()` now returns `locale` alongside `t` and `hasTranslation` — the locale it resolved
for the request, and the exact string `t` closes over. Reading it saves a second `getLocale()` call,
which could only ever disagree. `@comvi/nuxt`'s `useTranslation(event)` already returned it, so both
server helpers are now `{ t, hasTranslation, locale }`. Additive: nothing that destructures the old
two members changes.

`Accept-Language` matching also moved to one shared implementation with `@comvi/nuxt`, so the two
frameworks provably answer identically for the same header. No header changes the locale it resolved
to in this release.
