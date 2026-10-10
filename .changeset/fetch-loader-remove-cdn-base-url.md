---
"@comvi/plugin-fetch-loader": minor
---

**`CDN_BASE_URL` is not exported.** Nothing in the package read it: `cdnUrl` is a required option with no default and no environment override, so the constant and its `VITE_CDN_BASE_URL` / `NEXT_PUBLIC_COMVI_CDN_URL` reads answered a question the loader never asks. `API_BASE_URL` stays, since the API path really does fall back to it, and the hosted CDN default is readable as `comviPreset.cdnBaseUrl`.
