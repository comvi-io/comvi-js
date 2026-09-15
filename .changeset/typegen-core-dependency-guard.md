---
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Type generation now refuses to write when the app cannot resolve `@comvi/core`, and says how to fix it. The generated declaration augments `@comvi/core`, which the documented framework install only brings in transitively — so under a strict node_modules layout (pnpm, Yarn PnP) the augmentation had nothing to attach to. TypeScript reported TS2882 on the generated import, `skipLibCheck: true` removed that error, and every unknown translation key then type-checked against declarations that did nothing. Add `@comvi/core` to your own dev dependencies alongside the binding; `comvi generate-types` and the Vite plugin both name that command when it is missing. `comvi generate-types --check` still compares an existing file, so a production-only CI install does not fail the check.
