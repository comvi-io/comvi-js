---
"@comvi/react": minor
"@comvi/vue": minor
"@comvi/solid": minor
"@comvi/svelte": minor
---

**BREAKING** — `useI18n()` and `useI18n(ns)` return three booleans: `isReady` (a usable catalog is in, unchanged), `isFetching` (a load of its namespaces is in flight or expected, the former meaning of `isLoading`) and `isLoading`, which is now `!isReady && isFetching`: no usable catalog yet and one is loading, so render a placeholder. `if (isLoading) return <Skeleton />` is right at a first load, at a retry through `i18n.load(ns)` and during a locale switch, where the text on screen stays. `isLoading` no longer covers a load beside usable text (a switch, a background load): that is `isFetching`, for a busy indicator beside the text or to wait before rendering. `isReady` and `isLoading` both `false` means the text is unavailable and nothing is loading (a failed load, or no loader): render the component's fallback content. React and Svelte return plain values, Vue computed refs, Solid accessors.
