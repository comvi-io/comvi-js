---
"@comvi/plugin-fetch-loader": patch
---

`.with(fetchLoader(…))` and `.with(cdnLoader(…))` composed after `init()` now warn with the plugin-queue message, which is the one whose recovery advice works. Before, the loader capability attached first and claimed the once-per-host warning with advice that could not work on that host (`reloadTranslations()` throws `E_NO_LOADER_REGISTERED`, `addActiveNamespace()` fetches nothing). The `loadOnInit` JSDoc now says what the flag does on the public entry points: it does not suppress or add the `init()` request; use `ns: []` to start without one.
