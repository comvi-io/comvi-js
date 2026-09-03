---
"@comvi/core": patch
"@comvi/locale-routing": patch
"@comvi/next": patch
"@comvi/nuxt": patch
"@comvi/plugin-fetch-loader": patch
"@comvi/plugin-in-context-editor": patch
"@comvi/plugin-locale-detector": patch
"@comvi/react": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/vue": patch
---

Node 18 reached end of life; the packages now declare `node >= 20`. No code changed.

`@comvi/cli` and `@comvi/vite-plugin` are build-time tooling and keep their existing
`node >= 22`.
