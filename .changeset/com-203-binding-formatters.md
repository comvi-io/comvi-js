---
"@comvi/svelte": patch
"@comvi/vue": patch
"@comvi/react": patch
"@comvi/solid": patch
"@comvi/next": patch
"@comvi/nuxt": patch
---

`formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` are now exported from every binding, so code outside a component no longer needs `@comvi/core` as its own dependency. `@comvi/svelte` also exports them from `@comvi/svelte/format`, which imports nothing but `@comvi/core`, for code reached by plain Node (tests, scripts), where the root's `T.svelte` cannot load. `@comvi/next` has them on the root, `/client` and `/server`; `@comvi/nuxt` exports them from `@comvi/nuxt/i18n` and registers them as auto-imports at a low priority, so an app's own `formatDate` and the like keep winning. Each is core's own function, re-exported by name, so an app that does not format pays nothing.
