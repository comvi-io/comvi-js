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

**BREAKING (behaviour change on a 0.x minor): `t()` treats an empty string as untranslated.** A
key whose value is `""` in the active locale now renders the first non-empty value along the
fallback chain; it used to render as an empty string. This is what a translation platform
publishes for a value nobody has written yet. When no locale of the chain has text, the result is
still `""`, never the key, and `onMissingKey` is not called.
