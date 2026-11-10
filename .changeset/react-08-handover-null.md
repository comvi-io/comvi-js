---
"@comvi/react": minor
---

`<I18nHandover catalogs>` takes a server payload's failed slots (`HandoverCatalogs`: `Catalog | null`) with the meaning `createI18n({ catalogs })` gives them: the subtree renders without that catalog (the fallback the server rendered), and at commit the instance drops a catalog it held for the pair and does not ask for it until `i18n.load(ns)` or a switch to its locale. A later payload (a `router.refresh()`) therefore means what the first one meant; nothing remounts.
