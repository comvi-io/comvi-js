---
"@comvi/plugin-fetch-loader": patch
---

`CDN_BASE_URL` is deprecated and **removed in 0.6**. Nothing in the package reads it: `cdnUrl` is a required option with no default and no environment override, so the constant and its `VITE_CDN_BASE_URL` / `NEXT_PUBLIC_COMVI_CDN_URL` reads answer a question the loader never asks. `API_BASE_URL` stays — the API path really does fall back to it — and the hosted CDN default is still readable as `comviPreset.cdnBaseUrl`. No runtime change: the export is still there, still returns the same string, and now says so in its JSDoc and in the README.
