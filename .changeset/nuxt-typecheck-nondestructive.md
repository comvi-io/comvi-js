---
---

Make `@comvi/nuxt`'s `typecheck` script a non-destructive no-emit `tsc` pass instead of a full rebuild that rewrote `dist/`. This fixes intermittent `Could not load @comvi/nuxt` failures during `turbo run typecheck` (the rebuild raced with consumers reading `dist/`). Internal tooling only — no change to the published package.
