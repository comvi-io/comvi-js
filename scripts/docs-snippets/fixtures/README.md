# Snippet fixtures

The virtual project a page's fences compile in (docs-0.5 plan §6.2). 92 site fences
import a local path — `./i18n` 44×, `$lib/i18n`, `@/i18n/config`, `~/lib/i18n`,
`./locales/*.json`, `./$types` — because a page that shows `useI18n()` in a
component should NOT re-show the whole `createI18n(…).with(…)` chain above it.
"Every fence is self-contained" and "92 fences import a neighbour" cannot both
hold, so the neighbour is supplied here.

Precedence: a fence that carries `title="src/i18n.ts"` DEFINES that file for its
group, and this tree is not consulted for it. The fixtures only fill the holes a
page deliberately left.

`src/locales/**.json` is not enumerated: `typecheck.mjs` synthesises any
`**/locales/**.json` the project does not define (see `SYNTHETIC_CATALOG`),
because the pages name two dozen catalogs — `de.admin.json`,
`dashboard/en.json`, `en/common.json` — and a checked-in file per name would be
a list nobody maintains.
