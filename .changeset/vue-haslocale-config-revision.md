---
"@comvi/vue": patch
---

Reactive `hasLocale()` no longer goes stale when the default namespace changes. It tracked only
the translation-cache revision, but with no explicit namespace the host resolves against the
default namespace — config, not cache — so after `setDefaultNamespace()` the computed kept its
old value and disagreed with `hasLocaleNow()`. It now also tracks the config revision, like
`hasTranslation()` already did.
