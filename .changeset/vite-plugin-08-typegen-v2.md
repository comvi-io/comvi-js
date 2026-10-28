---
"@comvi/vite-plugin": minor
---

**BREAKING** — `comviTypes({ from, out?, sourceLocale?, fileTemplate?, defaultParams?, augment? })` writes the 0.8 `Catalogs` declaration through the same generator as `comvi typegen`, byte for byte. `vite build` generates once and fails the build on an error; `vite dev` follows the catalogs until the server closes: a burst of saves is one run, only the changed namespace is read again, an unchanged declaration is not rewritten, broken JSON is reported once and the previous file stays, and two dev servers of one app write it from one of them. `from` may also name `.comvi/schema.json` from `comvi pull`. Messages are read with `@comvi/core`'s own scanner. Catalogs are flat as 0.8 reads them: a nested object is reported and left out. Removed: `translations` and `output` (→ `from`, `out`), `defaultNs` (namespaces are members of `Catalogs`) and `strictParams` (→ `defaultParams`), and the re-exported 0.7 schema types.
