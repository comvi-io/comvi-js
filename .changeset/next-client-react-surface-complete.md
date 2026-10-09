---
"@comvi/next": minor
---

**`@comvi/next/client` now really does re-export react's whole 0.5 surface: `useI18nInstance` and
`ComponentMap` were missing.** The README says this entry carries react's 0.5.0 surface, and it
carried all of it except those two: `useI18nInstance()` — THE name for "give me the host" in
`@comvi/react`, `@comvi/solid` and `@comvi/svelte`, added there in this same release — and
`ComponentMap`, the type a `<T components={…}>` map is annotated with. A next client component
that wanted either had to import `@comvi/react` beside this package, which is exactly the second
specifier this entry exists to avoid. Both are named re-exports of react's own bindings, so the
value is identical (`client.useI18nInstance === react.useI18nInstance`) and the type is react's, pinned by
`tests/entry-surfaces.test.tsx` and `tests/types/client-surface.test-d.ts`. Purely additive.
