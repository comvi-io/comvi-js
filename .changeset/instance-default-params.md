---
"@comvi/core": minor
"@comvi/vue": minor
---

Instance-level `defaultParams`:

- `createI18n({ defaultParams: { formality: "formal" } })` merges the given params under every `t()`/`tRaw()` call; call-level params override defaults key by key (shallow merge).
- `setDefaultParams(params | undefined)` replaces the defaults at runtime and emits `configChanged` (source: `"defaultParams"`), so framework bindings re-render automatically; the `defaultParams` getter returns a copy of the current defaults.
- Params objects are copied on write, so mutating the object you passed in (or the getter result) never changes instance behavior.
- An ICU `select` whose param is missing still falls back to its `other` branch, which keeps missing-default setups rendering the informal/default text instead of breaking.

`@comvi/vue` exposes `setDefaultParams` on the Vue instance facade; renders that depend on defaults react to the change.
