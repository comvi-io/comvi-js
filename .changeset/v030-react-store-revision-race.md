---
"@comvi/react": patch
"@comvi/core": minor
---

Close the React `useStoreRevision` re-render race for non-cache events (M3).

A `configChanged` (fallback-locale / namespace-activation) or `defaultNamespaceChanged` that fired in the narrow window between a `useI18n` consumer's commit and its `useSyncExternalStore` subscribe-effect attaching could be dropped — the snapshot's per-component event counter started at 0 and only counted post-subscribe events, and these events don't bump the translation-cache revision.

The fix makes the React store snapshot **content-addressed**: it derives purely from observable instance state (`translationCache.getRevision()` + `isInitialized` + default namespace + active namespaces + fallback locales) instead of a subscription-timing-dependent counter, so state mutated before the subscriber attached is detected on the post-subscribe re-read. As a bonus, a bare `configChanged`/`defaultNamespaceChanged` emit that does NOT change state no longer forces a spurious re-render.

`@comvi/core` adds a small read-only `getFallbackLocales()` accessor used by the snapshot.
