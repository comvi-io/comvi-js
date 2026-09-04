---
"@comvi/next": minor
---

`useI18nLoader()` now hands out `removeActiveNamespace(ns)` and `removeActiveNamespaces(ns[])`
alongside `addActiveNamespace(s)`.

They are core's new deactivation: the namespace leaves `getActiveNamespaces()`, its in-flight
load is cancelled, and a `configChanged` event re-renders anything reading the active set.
Content already in the cache is untouched — `clearTranslations()` is content-only in every form
now, so it no longer deactivates anything.
