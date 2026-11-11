---
"@comvi/react": minor
"@comvi/core": minor
---

Nested catalogs are accepted by the input types where the runtime already flattens them: `<I18nHandover catalogs>` (`HandoverCatalogs`) takes `CatalogInput | null` per slot. `handover()` still hands over flat catalogs. Type-only: no runtime change. A CDN `fallback` takes `CatalogInput` (see the `fallback` changeset).
