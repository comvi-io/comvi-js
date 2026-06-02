---
"@comvi/core": minor
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/vue": minor
"@comvi/nuxt": minor
---

CORE reactivity fixes from the v0.3 review:

- **core (L3):** `addTranslations()` no longer emits `configChanged` for runtime-added translations — it relies on the `namespaceLoaded` event (and the cache-revision bump) that `_nsAddTranslations` already fires, removing a redundant double re-render. **Behavior note:** if you have an external `on("configChanged", …)` listener that was reacting to `addTranslations`, switch it to `on("namespaceLoaded", …)`. `configChanged` is still emitted for fallback-locale and namespace-activation changes. An empty `addTranslations({})` is now a true no-op.
- **core (L1):** the `Intl` formatter caches (number/date/relative-time) are now bounded (FIFO eviction at 1000 entries), mirroring the template cache. Prevents unbounded growth for apps formatting many distinct `(locale, options)` combinations via the per-call `locale` override.
- **solid & svelte (M4):** the cache-revision signal/store now uses a single monotonic counter instead of summing two independent counters, which could collide non-monotonically and drop a re-render (e.g. a `configChanged` that didn't change the translation cache).
- **vue (M1):** added imperative, non-reactive `hasTranslationNow(key, opts?)` and `hasLocaleNow(locale, namespace?)` returning plain booleans — for use in loops/handlers where the reactive `hasTranslation()`/`hasLocale()` (which allocate a `computed()` per call) would leak outside an effect scope. Re-exposed through `@comvi/nuxt`'s `useI18n()`.

Known issue (tracked for 0.3.1): the React `useStoreRevision` residual race for non-cache-revision events remains behind its already-shipped narrowed workaround; the core monotonic-per-emit-revision change was deferred to avoid a per-event-granularity regression under release pressure.
