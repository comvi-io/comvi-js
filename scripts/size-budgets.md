# Size budgets — the rule and how to re-baseline

Companion to `scripts/size-budgets.json`, enforced by `scripts/size-check.mjs` (`pnpm size`, run in
the CI `build` job after `pnpm build`). The JSON holds numbers and one-line notes; this file holds
the rule behind them.

## What the gate measures

Every row in `scripts/size-budgets.json` bundles one fixture from `scripts/size-fixtures/` with esbuild — `bundle`,
`minify`, `format: esm`, `platform: browser`, `target: es2020`, `__DEV__=false`,
`process.env.NODE_ENV="production"` — and gzips the result at level 9. The reported figure is
**min+gz bytes**.

Fixture imports resolve through each package's **published `exports` map** under the production
conditions `["production", "import", "module", "browser"]` — never through `dist/` paths and never
through the legacy `module`/`main` fields. A row therefore fails when the exports/conditions matrix
breaks for real consumers, not only when bytes grow. `assertPublishedFile` additionally rejects an
exports target that falls outside the package's `files` allowlist.

Framework peer deps (`react`, `vue`, `solid-js`, `svelte`, `next`, `nuxt`) are marked `external` per
fixture, so a framework row measures **the comvi graph only**.

A row may carry its own `define`, merged over the run's. The two Nuxt runtime rows
(`fw-nuxt-client-default`, `fw-nuxt-full-composite`) set `import.meta.server` to `false` and
`import.meta.client` to `true` and `import.meta.dev` to `false`, as Nuxt's production client build
does, so server-only and dev-only branches of the runtime are not counted against a client bundle
they never ship in. Both rows were re-baselined on 2026-10-03 when these flags came in. With the
same flags, `fw-nuxt-full-composite` measured 12491 B on the base branch (9219ef84), so of the rise
to the 12638 B recorded now from the 09-12 baseline of 12099 B, 392 B is base drift and 147 B is the
SSR fallback-chain loader that the fixture's server `loadMessages` import pulls in (chain
loading, in-flight dedupe and the per-request failed set the contract requires);
`fw-nuxt-client-default` measured 8330 B on the base and 8302 B after. A server utility a fixture
imports directly is still counted. The `comvi.head` util (`runtime/utils/html-attrs.ts`, which
writes `<html lang dir>`) then added 174 B to the floor and 183 B to the ceiling: they now measure
8483 B (235 B under the 8718 B budget) and 12829 B (441 B under 13270 B).

`fw-next-server-default-loader` was re-baselined on 2026-10-04 for the `withComvi` setup, from the
09-12 baseline of 7372 B to 7816 B. Of the rise, 208 B is base drift: the base branch (85a85d47)
already measured 7580 B. The rest is this lot: 117 B for the cell-then-alias lookup, the
`@comvi/next/config` stub import and the longer not-configured error, 1 B for the server provider
(tree-shaken from this fixture), and 118 B for the error's test-runner and `serverExternalPackages`
clause. The provider itself is measured by `fw-next-server-provider`.

`fw-next-middleware-edge` was added on 2026-10-04 with the shared `localeCookie` / `localeDetection`
vocabulary: `createMiddleware` from `@comvi/next/middleware`, the graph an app's `middleware.ts`
ships to the Edge runtime. It measured 1695 B on the base branch (e93168ca), 1902 B with the
vocabulary (the `query` source, the cookie attributes, `localeDetection: false`), 1911 B with the
`[@comvi/next]` prefix, and 1997 B once the options went through the ONE shared
`normalizeRoutingOptions` that `@comvi/nuxt` calls too; the budget is that last figure + 5 %.
For one commit `defineRouting` normalized the cookie as well, which cost the client rows ~100 B
for work only the middleware uses; it is declarative again, and `fw-next-root-composed` and
`fw-next-client-default` are back at 9807 B and 7450 B. `fw-nuxt-client-default` went from 8483 B on
the base to 8369 B, because the module resolves the options at build time.

`fw-next-root-composed`, `plugin-fetch-loader` and `platform-path-react` were re-baselined on
2026-10-04 for the core and fetch-loader release-review fixes, each to the measured figure + 5 %, the
headroom all three had at their previous baseline. Split per row, in bytes on the base branch
(8b680133) → after the lifecycle fixes (fallback copy, `addMessages` invalidation, single-flight and
transactional `init()`) → after the timed-out-plugin fix → after the loader dedup fix → after the
review follow-up that keeps a late cleanup below a newer `init()` attempt's rollback mark (88ba1a65,
the last ~+20 B): `fw-next-root-composed` 9810 → 9863 → 9943 → 9943 → 9962; `plugin-fetch-loader`
9501 → 9555 → 9633 → 9692 → 9711; `platform-path-react` 11168 → 11227 → 11306 → 11353 → 11375. The
budgets (10441, 10177, 11921) were set from the fourth step and stay. The bytes buy late-cleanup
capture for timed-out plugins in the plugin host and generation-aware request dedup in the loader.
Every other row fit its budget and kept it.

Every row is gated. There is no informational tier: a row that gates nothing does not earn its
measurement cost, and `size-check.mjs` throws on a row without a `gzipBudgetBytes`.

## The budget rule: measured + 5 %

> `gzipBudgetBytes = ceil(baseline.gzipBytes * 1.05)`

Every row, no exceptions. `baseline` records the sweep the budget came from (`minBytes`,
`gzipBytes`, `measuredAt`) and is **evidence, not a gate**.

The margin is 5 % because a row's gzip figure moves by ~1 B per imported content-hashed chunk name
whenever a source edit changes those hash characters, while the minified payload does not change at
all. The core build is deterministic, so such a swing is neither flakiness nor weight — 5 % absorbs
it, and only real regressions fire the gate.

`fw-svelte-full-composite` was re-baselined on 2026-10-04 (merged feat @ fc046c3a) from the 09-12
baseline of 11716 B to 12320 B. The row had 11 B of headroom left after the day's lots (strict
step r Svelte init gate +21 B, R3-B-2) and lot H2 then added 29 B of core that every full
composite carries: a shared promise published into the init slot BEFORE `_init()` runs (~17 B,
the fix for re-entrant `init()` from a synchronous listener) and two destroy guards that end a
mid-init teardown quietly (~10 B). Slimming inside the lot saved 12 B; the reviewer confirmed the
rest is the fix itself (folding the `started` flag into an existing field fails because `destroy()`
resets those fields before the late rejection arrives). `core-base` stays within its budget
(5364 B of 5534 B). Lot H1 (commit-safe React/Next handover) is expected to touch this row again.

`fw-react-default`, `fw-react-full-composite`, `fw-next-client-default`, `fw-nuxt-i18n` and
`plugin-fetch-loader-api` were re-baselined on 2026-10-05 (merged feat @ ec7b713e, lot H1) to
7369, 12262, 7766, 8415 and 11711 B. H1 removed the
last render-phase writes from the React and Next providers (an abandoned Suspense/transition render
could leave a stale `targetLocale` handover or publish a never-committed catalog to the shared
instance). The bytes are the feature, measured module by module: core overlay read view
`withMessages` with key-level fallthrough +43 B on every row that carries core (that alone is the
nuxt-i18n and fetch-loader-api overflow, 10–15 B over rows that had 21–44 B of headroom left after
H2); React `messages` prop + overlay view +105 B, publish-at-commit layout effect +114 B, derived
handover state +13 B, `useI18n` reading through the view +10 B; the Next provider itself shrank by
42 B. The Fable reviewer confirmed no byte sink remains that does not change behaviour (the one
lever, moving catalog normalisation into core, would push bytes onto Vue/Solid/Svelte rows with
2–31 B of headroom).

`core-full-composite`, `core-base-icu`, `fw-solid-full-composite`, `fw-svelte-default`,
`fw-vue-full-composite`, `fw-nuxt-full-composite` and `fw-next-server-provider` were re-baselined on
2026-10-05 (merged feat @ a40ad6fb) to 9389, 6502, 11723, 7067, 12390, 13276 and 2026 B. Six
of the seven rows carry only core's growth from lot H1b on rows that had 2–35 B of headroom left:
`withMessages()` returning three bound read methods instead of the prototype receiver (+24…30 B),
the `localeRevision` counter and the synchronous `setLocale()` on a full cache hit, which removed
the binding-side `ssrLocale` workarounds (+42…73 B on rows with the loader; `core-base` stays within
budget at 5446 B of 5534). Vue adds 45 B for the locale ref that mirrors the
instance after a failed or superseded switch. `fw-next-server-provider` grew 113 B from 1913 B: the
`x-comvi-locale` header is now checked against `routing.locales` (or a BCP-47 shape without a
routing config), with the routing registered on the manual setup path too, and the no-loader
warning names the remedy in full.

## How to re-baseline

1. Build the dists the gate reads: `pnpm build`.
2. Run **one** `node scripts/size-check.mjs`. That single run is authoritative — never mix figures
   from separate runs into one file.
3. For each row, set `baseline.{minBytes,gzipBytes}` to that run's numbers, `baseline.measuredAt` to
   the date, and `gzipBudgetBytes` to `ceil(gzipBytes * 1.05)`.
4. Re-run `node scripts/size-check.mjs` and confirm every row is green.
5. Say in the commit/handoff **which** sweep the file now records.

Re-baselining is not a way to pass a failing gate. A row that grew past +5 % is a finding: explain
the bytes first, then decide whether they ship.

## Row inventory

`core-base`, `core-base-icu`, `core-full-composite`; per framework
`fw-{react,solid,svelte,vue}-{default,full-composite}`; `fw-next-client-default`,
`fw-next-server-default-loader`, `fw-next-server-provider`, `fw-next-root-composed`, `fw-next-plugin-node`, `fw-next-middleware-edge`, `fw-nuxt-client-default`,
`fw-nuxt-full-composite`, `fw-nuxt-i18n`; the platform
path `plugin-fetch-loader`, `plugin-fetch-loader-api`, `platform-path-react`.

`fw-next-server-provider` is the server graph of the `withComvi` setup: `<ComviProvider>` and
`getI18n` with the provider's `"use client"` half and `@comvi/next/config` external, which is what
Next keeps on the server (a client reference, and the app's own config module). Measured with the
client half inlined instead, the row is 2737 B, so the external is what the row is about.

`fw-next-plugin-node` is no pair half: `@comvi/next/plugin` runs in Node from next.config and is
never bundled into an app, so its row only catches a runtime import creeping into the plugin.
Re-baselined 2026-10-04 to 937 B (budget 984 B, +5 %): the bytes re-apply the alias to the config
a user's webpack hook returns. The row catches an accidental core import; it does not pin bytes.

Each framework pair is a floor (one specifier, base host) and a ceiling (every capability composed
through that same specifier). The pair is the measurement — adding or removing one half turns the
other from a delta into a bare number, so change them together.

`plugin-fetch-loader` and `plugin-fetch-loader-api` are a pair for the same reason: the same
composition through the package root (`cdnLoader`) and through `@comvi/plugin-fetch-loader/api`
(`fetchLoader`). What separates them is the API request path `/api` reaches at runtime, so the two
numbers are only meaningful side by side.

Renamed on 2026-10-04 (first-impression lot), when `cdnLoader` became the package root and
`fetchLoader` moved to `/api`: `plugin-fetch-loader-cdn-lite` is now `plugin-fetch-loader` and
`plugin-fetch-loader-cdn` is now `plugin-fetch-loader-api`. Both measure the same module graph as
before the rename, so their budgets carry over unchanged.

## 2026-10-11: `#` formatted for the locale

`icuCompiler` now renders a plural `#` through a cached `Intl.NumberFormat` for the message
locale (ICU semantics: `1,234 items` in `en`), with a per-locale probe that keeps the integers
below 1000 on the `String()` fast path. Against the 0.5.0 code on `main` the change adds about
130 B min+gz to every row whose graph includes `@comvi/core/icu` and nothing to the others:
`core-base-icu` 6510 → 6645 B, `fw-nuxt-i18n` 8525 → 8655 B, `fw-next-root-composed`
10155 → 10286 B, `platform-path-react` 11837 → 11953 B; `core-base` 5452 → 5451 B,
`fw-react-default` 7425 → 7424 B.

All rows were re-baselined on this date. Most of the recorded movement is not this change: the
previous baselines dated 2026-09-12 to 2026-10-05 sat 1–4 % below the code that shipped as 0.5.0
(see `scripts/size-compare/README.md`, "Where the Comvi figures come from"), and this re-baseline
folds that drift in. Only `platform-path-react` crossed its old budget (11921 B), by 32 B. Every
budget is now the new baseline + 5 %, rounded up, the rule `scripts/docs-snippets/run.test.mjs`
enforces for every row (`platform-path-react` 12551 B, `core-base-icu` 6978 B, `core-base` 5724 B).

## 2026-10-11: `createNextI18n` composes no discovery

`createNextI18n` no longer attaches devtools discovery (COM-140), so the `@comvi/core/devtools`
graph left the `fw-next-root-composed` fixture, which composes the loader and a scoped plugin and
no `devtools()`. Only that row was re-baselined: 10286 → 9909 B min+gz (28740 → 27569 B min),
budget 10801 → 10405 B (baseline + 5 %, rounded up). The other five Next rows did not move. No row
measures the Next root with `.use(devtools())`.

## 2026-10-11: the editor loader in `devtools()`

The devtools capability now installs the page-level editor loader the browser extension calls
(`contracts/chrome-extension-proxy.json`, `editorLoader`): the slot, the version check, the hourly
cache salt, one `<script>` with a 10 s timeout, and the four failure codes including the CSP
listener. It costs about 720 B min+gz (1,600 B minified) on every row whose graph composes
devtools, and no code on any other row. Measured on one machine against `develop` @ 05a55e35, per
row: `core-full-composite` 9608 → 10332 B (+724), `fw-react-full-composite` 12554 → 13273 (+719),
`fw-solid-full-composite` 11934 → 12652 (+718), `fw-svelte-full-composite` 12639 → 13354 (+715),
`fw-vue-full-composite` 12590 → 13323 (+733), `fw-nuxt-full-composite` 13517 → 14240 (+723),
`fw-nuxt-i18n` 8681 → 9421 (+740).

On the previous budgets those seven rows are 80–333 B over, so they were re-baselined to the figures
above; the rise is the loader (the previous baselines, recorded the same day, sit 23–32 B below the
`develop` figures above). The other sixteen rows keep their baselines and budgets, among them
`fw-next-root-composed`, which composes no devtools since the entry above. Their minified size is
unchanged to the byte; their gzip figure moved by −5…+2 B (`fw-svelte-default` 7075 → 7070,
`fw-next-root-composed` 9923 → 9925, `core-base` 5458 → 5458), because the core build shares one
terser name cache across chunks and an edit to the devtools chunk reassigns the mangled letters in
the others.
