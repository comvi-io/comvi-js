---
"@comvi/plugin-fetch-loader": patch
---

The API base URL no longer reads `import.meta.env.VITE_API_BASE_URL`, which the published build could never see; pass `baseUrl`, or set `NEXT_PUBLIC_COMVI_API_URL` on Next.js.
