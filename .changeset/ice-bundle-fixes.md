---
"@comvi/plugin-in-context-editor": patch
---

Reduce the editor's consumer bundle cost and harden browser storage:

- npm ESM output is no longer minified; minification remains the standalone CDN build's responsibility
- the Vue modal, key selector, and their CSS load on the first edit interaction while the Collector lifecycle remains active from plugin startup
- stopped editor instances ignore late lazy imports and UI failures are reported without unhandled rejections
- selected-language storage tolerates blocked reads/writes, malformed JSON, and non-array values
- the insecure page-level API-key event channel remains disabled
