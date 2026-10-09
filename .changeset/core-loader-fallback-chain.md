---
"@comvi/core": minor
"@comvi/plugin-fetch-loader": patch
---

**A loader now fetches the fallback chain, and an empty translation falls through to it.**

`fallbackLocale` was a lookup rule only. With a loader, `init()` and `setLocale()` fetched the
active locale and nothing else, so `createI18n({ locale: 'de', fallbackLocale: 'en' })` over a CDN
rendered a key missing from `de` as the key: the `en` catalog it was supposed to fall back to had
never been requested. The same held for a `de-AT` → `de` → `en` chain and for a namespace
activated later.

Every load of a locale's namespaces now loads them for each locale of the fallback chain as well:
`init()`, `addActiveNamespace(s)()` and `setLocale()`. A catalog already in the cache, including
one passed as `messages` or hydrated from a server payload, is not requested again, and a fallback
equal to the locale costs nothing. A fallback catalog is a safety net and never a requirement: when
it fails to load, the failure reaches `onLoadError` and `onError` like any other and the operation
still succeeds. The locale's own catalog keeps its old rule, so `init()` rejects when every
namespace of the active locale failed. A chain changed with `setFallbackLocale()` after `init()` is
picked up by the next load or by `reloadMessages()`.

**BREAKING (behaviour change on a 0.x minor): an empty string is a missing translation.** A key
whose stored value is `""` reads as absent everywhere a key is looked up. `t()` renders the first
non-empty value along the fallback chain where it used to render an empty string, and
`hasTranslation()` returns `false` for it. A key that is empty in every locale of the chain takes
the missing-key path exactly like a key that is in none: `missingKey` fires, `onMissingKey` runs,
a per-call `fallback` is used, and otherwise the key is rendered. This is what a translation
platform publishes for a value nobody has written yet. Only the stored value is judged: a message
with text that renders empty for one call, such as an empty plural or select branch, is a
translation and is returned as is.
