---
"@comvi/plugin-fetch-loader": minor
---

New explicit `baseUrl` option — the documented way to point the loader at an API host. Precedence: `baseUrl` > legacy `apiBaseUrl` > build-time env overrides (`VITE_API_BASE_URL` / `NEXT_PUBLIC_COMVI_API_URL`) > the new `comviPreset` export, which now carries the vendor defaults (`https://api.comvi.io` / `https://cdn.comvi.io`). Defaults are preserved when `baseUrl` is absent — no behavior change without the new option. Internally, the 948-line `src/index.ts` is split into `options` / `http` / `cache` / `loader` modules with an unchanged public surface.
