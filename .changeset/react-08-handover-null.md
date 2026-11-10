---
"@comvi/react": minor
---

`<I18nHandover catalogs>` takes a server payload's failed slots (`HandoverCatalogs`: `Catalog | null`) with the meaning `createI18n({ catalogs })` gives them: the subtree renders without that catalog (the fallback the server rendered), and at commit the instance drops a catalog it held for the pair and does not ask for it until `i18n.load(ns)` or a switch to its locale. A later payload (a `router.refresh()`) therefore means what the first one meant; nothing remounts. The render with such a slot reads `isLoading` false for that pair, as the server did, so a hydration through `<I18nHandover catalogs>` with a client loader takes the same `isReady`/`isLoading` branch as the server HTML (it rendered the loading branch before and React reported a hydration mismatch).
