---
"@comvi/solid": minor
---

**BREAKING** — `useI18n()` (no namespace, or `undefined`) returns `isReady` / `isLoading` for `default` (the namespace its `t` reads) and every namespace of the `namespaces` option: `isReady` once each of them has a usable catalog of the locale on screen, a parent or a fallback locale (a catalog, not every key), `isLoading` while one of them loads. A namespace outside that set (a page's `useI18n("account")`, an `i18n.load()`) changes nothing. So `useI18n()` and `useI18n("default")` are no longer the same when the option names other namespaces: the second still reads `default` alone. `useI18n(ns)` is unchanged, and `t` and the bound `T` of `useI18n()` still read `default`; nothing new is held or loaded. Check `isReady` first: a switch loads beside the text on screen. `false`/`false` means the text is unavailable and nothing is loading (a failed load, or no loader), not necessarily an error.
