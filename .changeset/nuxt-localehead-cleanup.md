---
"@comvi/nuxt": patch
---

Internal cleanup, behavior-preserving: `useLocaleHead` no longer builds a `{ code }` fallback
object for a locale that has no entry in `localeObjects`. The composable only ever read `.iso`
and `.dir` off those objects, never `.code`, so the three fallbacks were dead weight; the reads
are now optional-chained (`localeObjects[locale]?.iso || locale`) and produce byte-identical
head output for every configuration, including a locale with no locale object at all.
