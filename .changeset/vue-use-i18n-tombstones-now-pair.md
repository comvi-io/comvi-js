---
"@comvi/vue": minor
---

**BREAKING (breaking change on a 0.x minor): `useI18n()` no longer returns `hasTranslationNow` / `hasLocaleNow`.** In react, solid and svelte `hasTranslation` and `hasLocale` ARE the non-reactive form, so vue's composable carried two extra names for what one name means everywhere else. The pair is unchanged on the `VueI18n` class: `inject(I18N_INJECTION_KEY)!.hasTranslationNow(key, opts?)` inside `setup()`, or any reference you already hold to the instance `app.use(i18n)` installed. Vue's reactive `hasTranslation(key, opts?)` / `hasLocale(locale, ns?)` — which return a `ComputedRef` and must be called in a reactive scope — are untouched.

Alongside it, the members that left `useI18n()` in 0.5 are re-declared on `UseI18nReturn` as `@deprecated` tombstones typed `never`: `addActiveNamespace`, `reloadTranslations` and `onLoadError` (now `useI18nLoader()`), `onMissingKey` (now `useI18nPlugins()`), and the two above. Each still autocompletes, struck through, with the acquisition in its tooltip, and any use is a type error rather than the bare "Property does not exist" that never said where to look. The tombstones are type-only and cost zero runtime bytes.
