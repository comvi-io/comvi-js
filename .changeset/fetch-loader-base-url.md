---
"@comvi/plugin-fetch-loader": minor
---

**BREAKING (breaking change on a 0.x minor): the API host option is `baseUrl`, and only `baseUrl`.** `apiBaseUrl` is removed from `FetchLoaderOptions`, so passing it is a type error. Precedence: `baseUrl` > build-time env overrides (`VITE_API_BASE_URL` / `NEXT_PUBLIC_COMVI_API_URL`) > the new `comviPreset` export, which carries the vendor defaults (`https://api.comvi.io` / `https://cdn.comvi.io`). Internally, the 948-line `src/index.ts` is split into `options` / `http` / `cache` / `loader` modules with an unchanged public surface.
