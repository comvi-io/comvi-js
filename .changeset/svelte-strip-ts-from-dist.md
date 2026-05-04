---
"@comvi/svelte": patch
---

Strip TypeScript types from published `.svelte` files via `svelte-preprocess`. Previously `dist/T.svelte` shipped with raw `<script lang="ts">` (type annotations and `import type`), which broke consumers and bundle analyzers without a TS-aware Svelte preprocessor (e.g. bundlephobia, older webpack setups).
