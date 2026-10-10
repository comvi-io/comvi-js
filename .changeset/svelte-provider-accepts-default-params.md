---
"@comvi/svelte": minor
---

setI18nContext now accepts an instance created with `defaultParams`.

- **It previously accepted no such instance at all.** `I18nCoreInstance` declares
  `setDefaultParams` as a property rather than a method, so `strictFunctionTypes` checks its
  parameter contravariantly and the instance is INVARIANT in its default-params type `D`. The
  boundary asked for `WrapperI18nInstance<{}>`, so `createI18n({ locale, defaultParams })` — a
  documented, first-class way to build an instance — was a compile error at
  `setI18nContext(i18n)`, with no correct spelling available. Callers were left casting.
- The boundary now takes an instance with any `D`. Only the two members that carry the invariance
  are widened: `setDefaultParams`, which is the source, and `init()`, which re-imports it by
  returning the instance recursively. Every other `D` position is a bivariant method or a
  covariant return type, so nothing else moves, and the widened type stays assignable to
  `WrapperI18nInstance<{}>` in both directions — no consumer of these types has to change.
- Making the boundary generic over `D` would NOT have worked: every `D` position in the instance
  is a conditional type or a bivariant method, so `D` has no inference site and silently falls
  back to its constraint. A compile-checked regression test pins both the `defaultParams` instance
  and the plain one.
- Type-only change: no runtime code was touched.
