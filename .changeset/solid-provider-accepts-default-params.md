---
"@comvi/solid": minor
---

I18nProvider now accepts an instance created with `defaultParams`.

- **It previously accepted no such instance at all.** `I18nCoreInstance` declares
  `setDefaultParams` as a property rather than a method, so `strictFunctionTypes` checks its
  parameter contravariantly and the host is INVARIANT in its default-params type `D`. The
  boundary asked for `WrapperI18nHost<{}>`, so `createI18n({ locale, defaultParams })` — a
  documented, first-class way to build an instance — was a compile error at
  `<I18nProvider i18n={…}>`, with no correct spelling available. Callers were left casting.
- The boundary now takes a host with any `D`. Only the two members that carry the invariance
  are widened: `setDefaultParams`, which is the source, and `init()`, which re-imports it by
  returning the host recursively. Every other `D` position is a bivariant method or a
  covariant return type, so nothing else moves, and the widened type stays assignable to
  `WrapperI18nHost<{}>` in both directions — no consumer of these types has to change.
- Making the boundary generic over `D` would NOT have worked: every `D` position in the host
  is a conditional type or a bivariant method, so `D` has no inference site and silently falls
  back to its constraint. A compile-checked regression test pins both the `defaultParams` host
  and the plain one.
- Type-only change: no runtime code was touched.
