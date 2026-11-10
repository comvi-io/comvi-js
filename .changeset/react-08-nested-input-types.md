---
"@comvi/react": minor
"@comvi/core": minor
---

Nested catalogs are accepted by the input types where the runtime already flattens them: `<I18nHandover catalogs>` (`HandoverCatalogs`) takes `CatalogInput | null` per slot, and a CDN `fallback` that returns a JSON module (`() => import("./de.json")`) may hold a nested catalog (`{ default: CatalogInput }`). `handover()` still hands over flat catalogs. Type-only: no runtime change.
