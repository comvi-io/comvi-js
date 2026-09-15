---
"@comvi/core": patch
"@comvi/next": patch
"@comvi/nuxt": patch
"@comvi/plugin-fetch-loader": patch
"@comvi/react": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/vue": patch
---

Every package README is now the short form: what the package is, install, the inline catalog,
connecting to Comvi, and the handful of things specific to that framework. The API references, the
SSR walkthroughs, the typed-keys sections and the composing-by-hand references moved to
comvi.io/docs/i18n, which is now the canonical place for all of it — each removed section has a
page there, linked from the README that used to carry it. No code changed.

The READMEs are published files, so this is what a reader sees on npm. They were 204 to 595 lines
each and most of that was reference material that drifts: a package README cannot be re-verified
against the build the way a docs page can, and eight of ten competitor READMEs carry no API
reference at all. What stays is deliberately the part a reader runs in the first minute, plus the
facts that only exist in this repo — one measured size figure per package, named by the fixture in
`scripts/size-budgets.json` so the `prose/stale-size-figure` gate still grades it, and the house
paragraphs (the ICU failure mode, the host definition, the `@comvi/core` formatters caveat, the
Content Deploy sentence), kept byte-identical.
