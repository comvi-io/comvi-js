---
"@comvi/core": patch
---

The packages are built with Vite 8.3 instead of 8.0, as part of a development-dependency security update. The emitted JavaScript differs only in the bundler's code generation (min+gz sizes move by 9 bytes or less); the API, the type declarations and the dependency ranges are unchanged.
