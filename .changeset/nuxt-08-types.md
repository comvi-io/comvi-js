---
"@comvi/nuxt": minor
---

`comvi.types: { from, out?, sourceLocale?, fileTemplate?, augment? }` in `nuxt.config` writes the typed-translations declaration from local JSON catalogs (or `.comvi/schema.json`) through the same generator as `comvi typegen --from`, `@comvi/vite-plugin` and `withComvi({ types })`, byte for byte. `from` and `out` resolve against `rootDir`; `sourceLocale` defaults to `defaultLocale`; the file goes to `<buildDir>/types/comvi.d.ts` and the module adds it to Nuxt's generated tsconfigs (the app's and Nitro's), so `.vue` files and server routes are typed with nothing to configure or commit. `nuxt prepare`, `nuxt typecheck` and `nuxt build` generate it before anything is checked and fail on a broken catalog; `nuxt dev` follows the catalogs with one watcher until Nuxt closes, reports an error and keeps the previous file. Without `types`, nothing is generated.
