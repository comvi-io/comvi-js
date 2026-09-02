---
"@comvi/vue": patch
---

`<T :components>`'s config entry is now core's own type, not a vue-local copy of it.

- **The `tag` spelling always worked; the declaration said otherwise.** `prepareTranslation`
  resolves an entry through `handler.tag ?? handler.component`, but the vue type hand-rolled
  `{ component: string | Component; props?: … }` — the `component` alias only. The entry type is
  now core's `TagComponentConfig` intersected with the Vue target types, so the two cannot drift
  apart again, and one of the two spellings is required (core's own shape makes both optional,
  which would admit a target-less entry the pipeline does not treat as a config at all).
- **Nothing new compiles and nothing stops compiling.** Verified against the pre-change union:
  `{ link: { tag: 'a', props: { href: '/help' } } }` already type-checked, because Vue's own
  `Component` type accepts an arbitrary object — which is also why vue, unlike react, still
  accepts entries that name no target. That looseness belongs to `Component` and is unchanged
  here; it is now pinned by a type test so it cannot be mistaken for a regression later.
- Type-only change: no runtime code was touched.
