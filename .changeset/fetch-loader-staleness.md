---
"@comvi/plugin-fetch-loader": patch
---

Harden fetch-loader request lifecycle and response diagnostics:

- plugin cleanup aborts in-flight API and CDN requests without running fallbacks or load callbacks; locale changes do not cancel explicit preload requests
- SSR cache options now propagate through the API translations, project-info, export, and legacy-export paths
- malformed JSON errors identify the exact response URL, including legacy fallbacks
- successful API responses must contain a valid `namespaces` object instead of silently becoming an empty translation store
- `fetchApiTranslations` and `fetchProjectInfo` accept additive request options after the existing custom transport and cache-scope arguments
