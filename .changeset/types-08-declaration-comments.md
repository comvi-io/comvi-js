---
"@comvi/core": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/cli": patch
---

The documentation comments in the published type declarations, which your editor shows on hover, now describe only what the API does. The `t()` comment says how to hide text that is not there yet: check the binding's `isReady` first, then `isFetching`; `isReady` false with `isFetching` false means the text is not available, not necessarily that a load failed. No code changed.
