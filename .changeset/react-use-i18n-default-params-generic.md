---
"@comvi/react": patch
---

`UseI18nReturn<D>.setDefaultParams` is generic in `D` again, so a replacement bag that drops a
constructor-guaranteed default key is a type error rather than a runtime throw.

The internal `Instance` alias was declared as the non-generic `WrapperI18nInstance`, which collapses `D`
to `{}` for every member reached through it. `setDefaultParams` is the only such member that
depends on `D`, so on a `useI18n<{ brand: string }>()` return the calls
`setDefaultParams({})`, `setDefaultParams(undefined)` and `setDefaultParams({ brand: 123 })` all
compiled; core then threw `E_DEFAULT_PARAMS_GUARANTEED_KEY` at runtime. 0.4.1 typed this member
through `I18n<D>`, and vue, solid and svelte all kept the generic. The alias is now
`Instance<D extends DefaultTranslationParams = {}> = WrapperI18nInstance<D>` and the member reads
`Instance<D>["setDefaultParams"]`, pinned by `tests/types/default-params.test-d.ts`. `reportError`,
the other member on that alias, has a `D`-independent signature and is unchanged. Code that
called `setDefaultParams` correctly is unaffected; code that did not now fails to compile
instead of at run time.
