---
"@comvi/cli": patch
---

Build hygiene only, no shipped-output change: `vite.config.ts` now sets `build.emptyOutDir: true` explicitly instead of relying on Vite's implicit default, so a real build always starts from an empty `dist` even if a stray file from an earlier package layout is sitting there.
