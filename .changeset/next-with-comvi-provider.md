---
"@comvi/next": minor
---

Add `withComvi({ config })` in `@comvi/next/plugin` and the server `<ComviProvider>`, so a Next app needs no `setI18n()` module and no `"use client"` wrapper. Pages call `getI18n({ locale })`, and the manual setup keeps working unchanged.
