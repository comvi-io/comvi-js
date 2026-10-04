---
"@comvi/plugin-fetch-loader": minor
---

`cdnLoader` is now the package root, `import { cdnLoader } from "@comvi/plugin-fetch-loader"`, and `fetchLoader` with the HTTP helpers moved to `@comvi/plugin-fetch-loader/api`. The `/cdn` subpath is removed, and the `@comvi/core` peer range is `^0.5.0`.
