---
"@comvi/cli": patch
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
"@comvi/vite-plugin": patch
"@comvi/vue": patch
---

`publishConfig.access` is now declared as `public` in every published manifest.

`access: "public"` previously lived only in `.changeset/config.json`, so it applied to
`changeset publish` and nothing else. Any other publish path had to remember `--access public`
or npm would refuse the scoped package as private. The declaration now travels with each
manifest. No code changed.
