---
"@comvi/plugin-in-context-editor": patch
---

Bundle and robustness fixes from the fleet-wide audit:

- npm ESM output is no longer minified (per bundle policy — only the standalone CDN IIFE build minifies)
- the Vue editor UI (modal, key selector, CSS) is now loaded via dynamic `import()` on the first edit click instead of eagerly from `Core` — importing the plugin no longer pulls the whole editor UI into the consumer's module graph, even without the `production` export condition
- `localStorage` access in the edit modal is guarded (sandboxed iframes / Safari private mode throw `SecurityError`), and the stored language selection is validated as an array
- malformed JSON in the external-config `CustomEvent` (API-key injection channel for the standalone runtime) is ignored instead of throwing in the listener
