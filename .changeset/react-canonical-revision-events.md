---
"@comvi/react": minor
---

`useI18n()` consumers now re-render on the full canonical 7-event revision set via core's `subscribeToRevision` (previously a hand-copied 5-event subset: `localeChanged` and `loadingStateChanged` were only observable through the provider contexts). The internal `useStoreRevision(i18n)` no longer takes an event list — it always subscribes to the canonical set, and its content-addressed snapshot now includes the locale and loading axes, so any state-changing canonical event is re-render-visible regardless of subscription timing. The narrow per-axis selector hooks (`useLocale`, `useIsLoading`) keep their minimal subscriptions.

Internal dedupe: the local `isVirtualNode` copy is replaced by core's own export, re-exported from the `@comvi/core` root so the binding reaches it without naming `@comvi/core/tags` and without pulling the tag graph into its bundle; `t`/`tRaw` types are now core's `TranslateFn` (inference unchanged). React's element-aware `translationResultToString` stays local by design.

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
