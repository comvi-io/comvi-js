---
"@comvi/plugin-fetch-loader": patch
"@comvi/plugin-in-context-editor": patch
"@comvi/plugin-locale-detector": patch
---

Pin the `@comvi/core` peer range to the minor line each release ships with (`^0.3.0` for 0.3.x, auto-synced to `^0.4.0` at the next release by `scripts/sync-peer-ranges.mjs`). Prevents the out-of-range escalation that turned the whole fixed group into a major bump at version time.
