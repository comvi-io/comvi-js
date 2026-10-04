---
"@comvi/plugin-fetch-loader": minor
---

**BREAKING (breaking change on a 0.x minor): the API host option is `baseUrl`, and only `baseUrl`.** `apiBaseUrl` is removed from `FetchLoaderOptions`, so passing it is a type error. The hosted default stays readable as `comviPreset.apiBaseUrl`.
