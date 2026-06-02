---
"@comvi/react": patch
---

Fixed: React's "Cannot update a component (`X`) while rendering a different component (`Y`)" warning no longer fires when a parent component synchronously emits an i18n event during render (e.g. `<I18nProvider messages={...}>` re-rendering on locale change triggers `addTranslations` from its `useState` initializer).

Internal: `useSubscribe` and `useStoreRevision` now defer React's store-update notification by one microtask (`queueMicrotask`), breaking the synchronous `_emit → subscribe-callback → scheduleUpdateOnFiber` chain that produced the warning (see `packages/core/src/core/i18n.ts:438-448`). A `disposed` flag prevents stale callbacks after unsubscribe or `i18n` prop swap. The revision counter in `useStoreRevision` is still bumped synchronously so `getSnapshot` reads always see the latest value.

**Significantly narrows** the v0.3.1 KNOWN LIMITATION previously documented in `useI18n.ts:45-53` (residual race window depends on React-internal subscribe-set-up vs first-event ordering).

Pre-1.0 internal change; consumer API unchanged.
