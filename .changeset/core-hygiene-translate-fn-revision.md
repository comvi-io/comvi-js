---
"@comvi/core": minor
---

Three tree-shakeable additions to `@comvi/core`, free for non-importers:

- `TranslateFn<D, R>` — the canonical typed translation call-signature set (namespaced keys,
  default-namespace keys, permissive fallback). Every wrapper's `t` / `tRaw` type is now an
  alias of it instead of a hand-copied overload block; inference is unchanged.
- `subscribeToRevision(i18n, callback)` + `REVISION_EVENTS` — subscribes a callback to the
  canonical 7-event revision set (`localeChanged`, `namespaceLoaded`, `loadingStateChanged`,
  `initialized`, `translationsCleared`, `defaultNamespaceChanged`, `configChanged`). The
  callback receives the event name, so a bridge with separate reactive axes can route
  without re-declaring the list.
- `isVirtualNode` is exported from `@comvi/core` (previously `@comvi/core/tags` only), so
  consumers outside the tag graph can narrow `TranslationResult` parts without pulling tag
  machinery in.
