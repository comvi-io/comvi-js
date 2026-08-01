---
"@comvi/react": minor
---

`useI18n()` consumers now re-render on the full canonical 7-event revision set via core's `subscribeToRevision` (previously a hand-copied 5-event subset: `localeChanged` and `loadingStateChanged` were only observable through the provider contexts). The internal `useStoreRevision(i18n)` no longer takes an event list — it always subscribes to the canonical set, and its content-addressed snapshot now includes the locale and loading axes, so any state-changing canonical event is re-render-visible regardless of subscription timing. The narrow per-axis selector hooks (`useLocale`, `useIsLoading`) keep their minimal subscriptions.

Internal dedupe: the local `isVirtualNode` copy is replaced by the core root export; `t`/`tRaw` types are now core's `TranslateFn` (inference unchanged). React's element-aware `translationResultToString` stays local by design.
