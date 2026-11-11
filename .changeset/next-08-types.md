---
"@comvi/next": minor
---

`withComvi({ types: { from, out?, sourceLocale?, fileTemplate?, augment?, check? } })` writes the typed-translations declaration from local JSON catalogs (or `.comvi/schema.json`) while next.config loads, through the same generator as `comvi typegen --from` and `@comvi/vite-plugin`, byte for byte. `next dev` generates and follows the catalogs with one watcher for the whole `next dev` process tree, also when Next loads the config again; `next build` generates once per build process (its workers included) and fails on a broken catalog; `check: true` makes `next build` write nothing and fail on a stale or missing file. It runs in config loading, so webpack and Turbopack get the same file. With `types`, `withComvi(...)` returns the function form of next.config.
