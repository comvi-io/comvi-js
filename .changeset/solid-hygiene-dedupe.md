---
"@comvi/solid": patch
---

Internal dedupe, behavior-preserving: the private `isVirtualNode`/`virtualNodeToText`/`translationResultToString` copies are replaced by `translationResultToString` from `@comvi/core`; `t`/`tRaw` types are built on core's `TranslateFn` (inference unchanged). `createCacheRevisionSignal` now consumes core's canonical `subscribeToRevision` helper but keeps skipping the locale/loading axes (those stay on the dedicated `createLocaleSignal`/`createLoadingSignal` primitives), preserving the pinned-locale `<T>` no-recompute contract.
