---
"@comvi/core": minor
---

Hygiene batch additions to the root entry (all tree-shakeable, zero cost for non-importers):

- `TranslateFn<D, R>` — the canonical typed translation call-signature set (namespaced keys, default-namespace keys, permissive fallback). The framework wrappers' `t`/`tRaw` types are now aliases of it instead of hand-copied ~30-line overload blocks per wrapper.
- `subscribeToRevision(i18n, callback)` + `REVISION_EVENTS` — subscribes a callback to the canonical 7-event revision set (`localeChanged`, `namespaceLoaded`, `loadingStateChanged`, `initialized`, `translationsCleared`, `defaultNamespaceChanged`, `configChanged`). This is the single source of truth for the wrappers' event→reactivity bridges; the callback receives the event name so bridges with separate reactive axes can route without re-declaring the list.
- `isVirtualNode` is now exported from the root entry (previously `@comvi/core/tags` only), so consumers outside the tag graph can narrow `TranslationResult` parts without pulling tag machinery.
