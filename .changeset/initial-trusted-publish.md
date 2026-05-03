---
"@comvi/cli": patch
"@comvi/core": patch
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

Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
