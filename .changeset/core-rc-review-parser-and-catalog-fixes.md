---
"@comvi/core": patch
---

A catalog built with `Object.create(null)` is now flattened like any other nested catalog.

Such a catalog used to be adopted whole on the strength of its missing prototype, so a nested
one was stored with an object where a string belonged: `t("nav.home")` answered with the key and
`t("nav")` threw. An already-flat prototype-less catalog is still adopted without a copy.
