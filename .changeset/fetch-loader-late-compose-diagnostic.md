---
"@comvi/plugin-fetch-loader": patch
---

`.use(fetchLoader(…))` and `.use(cdnLoader(…))` composed after `init()` now warn with the plugin-queue message, which is the one whose recovery advice works. Before, the loader capability attached first and claimed the once-per-instance warning with advice that could not work on that instance (`reloadMessages()` throws `E_NO_LOADER_REGISTERED`, `addActiveNamespace()` fetches nothing). The `loadOnInit` JSDoc now says what the flag does on the public entry points: it does not suppress or add the `init()` request; use `ns: []` to start without one.
