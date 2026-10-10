---
"@comvi/solid": minor
---

`ComponentMap` now accepts the `{ component, props }` spelling of a config entry.

- **The runtime always accepted it; only the type did not.** `prepareTranslation` resolves an
  entry through `handler.tag ?? handler.component`, but `ComponentHandler` hand-rolled
  `{ tag: …; props?: … }` — the `tag` alias only, so the vue-style `component` spelling was a
  compile error against a pipeline that handles it fine. Both spellings now type-check.
- **The entry type is core's own.** `ComponentConfig` is core's `TagComponentConfig` intersected
  with the Solid target types, so a change to the shape core reads breaks this package loudly
  instead of drifting. Exactly one of `tag` / `component` is still required: core's shape makes
  both optional, which would have admitted a target-less `{ props }` entry that
  `isTagComponentConfig` rejects and the pipeline then forwards as an opaque handler.
- A config entry's target stays deliberately looser than a bare handler's — a component with
  REQUIRED props is legal there, because the entry's own `props` are what satisfy them.
- `props` keeps its `Record<string, any>` value type rather than adopting core's
  `Record<string, unknown>`. An interface-typed props object is not assignable to
  `Record<string, unknown>` (only type-literal objects are), so taking core's stricter type
  would have silently broken maps that compile today. A type test pins this.
- Type-only change: no runtime code was touched.
