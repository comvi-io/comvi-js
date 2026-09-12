---
"@comvi/react": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/vue": patch
---

`useI18nLoader()` and `useI18nPlugins()` are now one line each over `@comvi/core`'s `acquireLoaderApi` / `acquirePluginsApi`, instead of four copies of the same acquisition code. `UseI18nLoaderReturn` and `UseI18nPluginsReturn` are aliases of core's `AcquiredLoaderApi` / `AcquiredPluginsApi` — the same members, the same types, the same throw on a host without the capability, and the same per-host identity of the returned members. Nothing in the public surface moved, so no app changes.

The copies existed because a wrapper cannot import another wrapper, and they were pinned by a text-diff release gate after react once wrapped the `onMissingKey` callback in a `String(...)` coercion the other three did not have. With one implementation the drift is gone by construction, and so is that half of `scripts/wrapper-hooks-parity.test.mjs` — the half that diffs the four `useI18n()` member sets stays.
