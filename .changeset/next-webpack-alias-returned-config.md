---
"@comvi/next": patch
---

`withComvi` now adds the `@comvi/next/config` alias to the config your own `webpack` function returns, so a fresh object or a replaced `resolve.alias` keeps it.
