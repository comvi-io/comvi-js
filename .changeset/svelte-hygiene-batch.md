---
"@comvi/svelte": minor
---

- **Removed** the deprecated `createLanguageStore` (deprecated since ≤0.4.0) — use `createLocaleStore`.
- The cache-revision store (`createCacheRevisionStore`, and the `cacheRevision` returned by `useI18n()`) now bumps on core's canonical 7-event revision set via `subscribeToRevision` — adding `localeChanged` and `loadingStateChanged` to the previous 5-event list — so its `configChanged` semantics and event coverage match the vue bridge. Derived translation stores may recompute (cheaply) on locale/loading changes they previously ignored; output values are unchanged.
- `dist/types.js` (an empty 11 B artifact emitted for the pure-type module) is no longer published: `src/types.ts` became `src/types.d.ts`, so `svelte-package` copies the declarations without emitting a dead runtime file.
- Internal dedupe: `translationResultToString` now comes from `@comvi/core`; `SvelteTextTranslationFunction`/`SvelteRawTranslationFunction` are aliases of core's `TranslateFn` (inference unchanged).
