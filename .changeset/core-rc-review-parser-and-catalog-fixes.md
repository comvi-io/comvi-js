---
"@comvi/core": patch
---

A catalog built with `Object.create(null)` is now flattened like any other nested catalog.

Such a catalog used to be adopted whole on the strength of its missing prototype, so a nested
one was stored with an object where a string belonged: `t("nav.home")` answered with the key and
`t("nav")` threw. An already-flat prototype-less catalog is still adopted without a copy.

Extension syntax inside a plural or select branch is now parsed exactly as it is at the top level.

Only `{`, `<` and `'` used to send a selected sub-message back through the parser, so a branch of
plain text kept `&amp;` escaped while the same text one level up rendered `&` — and adding a
parameter to the branch changed the entity's rendering. All five syntax characters are now one
shared list.
