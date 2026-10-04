---
"@comvi/vue": minor
---

**BREAKING (breaking change on a 0.x minor): `useI18n()` no longer returns `hasTranslationNow` / `hasLocaleNow`.** In react, solid and svelte `hasTranslation` and `hasLocale` ARE the non-reactive form, so vue's composable carried two extra names for what one name means everywhere else. The pair is unchanged on the `VueI18n` class: `inject(I18N_INJECTION_KEY)!.hasTranslationNow(key, opts?)` inside `setup()`, or any reference you already hold to the instance `app.use(i18n)` installed. Vue's reactive `hasTranslation(key, opts?)` / `hasLocale(locale, ns?)` — which return a `ComputedRef` and must be called in a reactive scope — are untouched.
