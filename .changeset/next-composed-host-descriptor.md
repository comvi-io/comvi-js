---
"@comvi/next": patch
---

`createNextI18n`'s composed host installs its import-map `registerLoader` overload with `Object.defineProperty` (non-enumerable, writable, configurable) instead of plain assignment. Behaviour is unchanged today — the property was already an own non-enumerable member from `attachLoader`, so assignment kept it hidden — but the reflective contract (`{...host}` carries data only) no longer depends on how the loader capability happens to be installed. Pinned by two new reflection tests, one of which fails under a prototype-installed loader with the old assignment.
