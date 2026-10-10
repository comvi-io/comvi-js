---
"@comvi/react": minor
---

`<T components>` now types the `{ tag | component, props }` config entry form.

- **The runtime already accepted it; only the type did not.** `prepareTranslation` resolves a
  `{ tag: "a", props: { href: "/help" } }` entry into a real element, and `resolvePending`
  merges a config entry's `props` into an element or render-function handler — but the react
  `ComponentsMap` listed only the plain targets (tag name, element, render function), so the
  documented form needed a cast to compile. `ComponentHandler` now also accepts the config
  entry, narrowed to React targets on top of core's own `TagComponentConfig` so the field set
  cannot drift from the pipeline that reads it. `tag` (solid/svelte spelling) and `component`
  (vue spelling) are aliases, `props` stays optional, and entries that are neither a target nor
  a config entry are still rejected.
- Internal: five string fast paths in `<T>`'s node conversion and `useI18n`'s text flattening
  were provably identical to the generic branch they sat in front of, and the marker-lookup
  allocation guard only chose an empty `Map` over `null`. All are gone; rendered output and the
  public API are unchanged.
