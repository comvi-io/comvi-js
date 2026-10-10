---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/vue": minor
---

**`useI18n(ns)` narrows keys in all four bindings.** Solid's namespace-bound `t` / `tRaw` helpers are lifted into `@comvi/core` as `NamespaceBoundTranslateFn<NS, D, R>` (and `NamespaceBoundParamsArg`), and `ns` is now generic in react, svelte and vue: `useI18n("admin").t("dashboard")` is exact for `admin:dashboard` (params typed from the generated key), a key from another namespace is rejected, and the explicit `{ ns }` form is untouched. Before, react, svelte and vue took `ns?: string`, which left no inference site — the same call was a type error even for the namespace's own keys.

`UseI18nReturn` gains a second type parameter, `UseI18nReturn<D, NS = undefined>` (solid keeps its `<NS, D>` order), and svelte's `SvelteTextTranslationFunction` / `SvelteRawTranslationFunction` take `<D, NS>` likewise. **This can break a caller the loose overload accepted:** a call whose key resolves through the new bound overload now gets that key's own params check — `useI18n("admin").t("settings")` where `admin:settings` declares a required param is rejected instead of falling through — and a hand-written alias that spelled the old one-parameter `useI18n<D>` signature, or assigned `useI18n(ns)`'s result to a type narrower than `UseI18nReturn<D, typeof ns>`, needs the extra parameter.
