---
"@comvi/core": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/next": patch
"@comvi/nuxt": patch
"@comvi/plugin-fetch-loader": patch
"@comvi/plugin-locale-detector": patch
"@comvi/plugin-in-context-editor": patch
---

Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

Runtime packages (the ones end-user apps install as dependencies) no longer
require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

`@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
target for development and CI.
