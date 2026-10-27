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

A baseline belongs to its row, not to the file. `baseline.measuredAt` dates the sweep that row's
figures came from, and rows in the file may carry different dates: a new row is baselined from the
sweep that introduces it, a row whose graph changed is re-baselined from the sweep of that change,
and every other row keeps its dated baseline until its own re-baseline. That is how the editor
loader (only the rows that compose `devtools()`), the Next discovery change (one row) and the two
`devtools()` rows of 2026-10-12 were recorded; the `#` change re-baselined every row because the
earlier baselines had all drifted. What is never mixed is one row's own figures, or one stated
difference: `minBytes` and `gzipBytes` of a row come from the same run, and a delta between two
rows is quoted from one sweep (or says which recorded baselines it subtracts).

1. Build the dists the gate reads: `pnpm build`.
2. Run **one** `node scripts/size-check.mjs`. Every figure this change writes comes from that
   single run.
3. For each row you re-baseline, set `baseline.{minBytes,gzipBytes}` to that run's numbers,
   `baseline.measuredAt` to the date, and `gzipBudgetBytes` to `ceil(gzipBytes * 1.05)`. Leave the
   rows this change does not move as they are.
4. Re-run `node scripts/size-check.mjs` and confirm every row is green.
5. Say in the commit/handoff **which** rows were re-baselined, from which sweep, and add a dated
   section below.

Re-baselining is not a way to pass a failing gate. A row that grew past +5 % is a finding: explain
the bytes first, then decide whether they ship.

## Row inventory

`core-compile`, `core-locale`, `core-negotiate`, `core-icu`, `core-icu-cdn`, `core-icu-devtools`,
`core-devtools`, `core-format`, `core-plugins` (the 0.8 core; the 0.7 `core-base*` rows are gone);
per framework
`fw-{react,solid,svelte,vue}-{default,full-composite}`, `fw-svelte-format`; `fw-next-client-default`,
`fw-next-server-default-loader`, `fw-next-server-provider`, `fw-next-root-composed`, `fw-next-root-devtools`, `fw-next-plugin-node`, `fw-next-middleware-edge`, `fw-nuxt-client-default`,
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

## 2026-10-12: rows for `devtools()` alone and in Next

Two rows were added so that what `.use(devtools())` costs is a gated figure, not a subtraction
between full composites. One sweep on `develop` @ e198fc9d measured both.

`core-base-devtools` is the `core-base` fixture plus `.use(devtools())`: 6672 B min+gz (17431 B
min), budget 7006 B. `core-base` measured 5458 B in that sweep, so discovery and the editor loader
together cost 1214 B (1221 B against `core-base`'s recorded 5451 B). About 720 B of it is the
editor loader (the section above); the rest is the discovery that shipped in 0.5.0.

`fw-next-root-devtools` is the `fw-next-root-composed` fixture plus `.use(devtools())`, so the
editor loader's weight is gated in Next as it is in the other bindings through their
full-composite rows: 11023 B min+gz (30390 B min), budget 11575 B. `fw-next-root-composed` measured
9925 B in that sweep, a difference of 1098 B.

Both budgets are baseline + 5 %, rounded up. No other row was re-baselined: the 23 existing rows
measured 0 to 35 B above their recorded baselines (core changes merged after each row's last
sweep), each at least 4.3 % under its budget.

## 2026-10-14: 22 rows re-baselined on the 0.6.0 release build

**Measure on the Node major CI runs.** The gzip figure comes from Node's bundled zlib, so it moves
with the Node version while the minified payload does not. The first sweep of this re-baseline ran
on Node 26.9.0 and read every row between 24 B lower and 9 B higher than Node 24.20.0 read it, with
the minified bytes identical to the byte on all 25 rows. CI's `build` job runs Node 24
(`.github/workflows/ci.yml`), so the figures below, and the three in
`.github/release-notes/0.6.0.md`, are the **Node 24** sweep. A baseline recorded from another major
is not wrong by much — the 5 % margin absorbs it — but it does not describe the gate that runs, and
it silently contradicts the release notes. Say which Node a sweep used.

22 of the 25 rows were re-baselined from **one** `node scripts/size-check.mjs` run on the 0.6.0
release commit (`a74da136`) under Node 24.20.0, after `pnpm build`. Every row was green on its
previous budget before the re-baseline and is green after it: this folds in the core work that
landed after the 2026-10-11 and 2026-10-12 sweeps, it does not rescue a failing gate.

The movement is core, and the three rows that carry no core graph say so: `fw-next-server-provider`
(2052 B), `fw-next-plugin-node` (939 B) and `fw-next-middleware-edge` (2045 B) measured their
recorded baselines exactly, to the byte, min and gzip alike, so they keep their 2026-10-11
baselines and dates. Every other row grew, and the minified growth spans +460…+671 B. It does not
fall into neat bands, so here is every cluster: **+460…+467 B** on the eight floor rows
(`core-base`, `fw-{react,solid,svelte,vue}-default`, `fw-next-client-default`,
`fw-next-server-default-loader`, `fw-nuxt-client-default`); **+523 B** on
`fw-next-root-composed`; **+561…+563 B** on `core-base-icu`, both fetch-loader rows and
`platform-path-react`; **+619 B** on `core-base-devtools`; **+665 B** on `fw-nuxt-i18n`; and
**+669…+671 B** on the six full composites and `fw-next-root-devtools`. `core-base-devtools` and
`fw-nuxt-i18n` each sit alone between the middle and the top, and this sweep does not say why:
composing `devtools()` does not predict one figure either, since the three devtools rows that are
not full composites measured +619, +665 and +670 B. One sweep gives totals, not per-feature
attribution. In gzip the whole span is +145…+259 B, between +1.6 % and +3.0 % of the row's own
recorded baseline. That is the 0.6.0 core work: the numeric template-cache partition key, the flat catalog kept by
reference, the function-parameter placeholder and its warning, the ICU nested-comma fix, plural
`-0`, and the `editorVersion` SemVer check that fails closed.

Anchors from this sweep, in bytes min+gz: `core-base` 5451 → 5608, `core-base-devtools`
6672 → 6872 (so `devtools()` costs 1264 B, still about 1.2 kB), `core-base-icu` 6645 → 6842,
`core-full-composite` 10332 → 10575, `fw-react-default` 7424 → 7605, `fw-nuxt-i18n` 9421 → 9647,
`platform-path-react` 11953 → 12157. Every budget is the row's new baseline + 5 %, rounded up. The
`core-base` and `core-base-devtools` table in `docs/design/editor-loader.md` was updated to this
sweep; the three figures in `.github/release-notes/0.6.0.md` already matched it and were not
touched.

## 2026-10-26: `fw-svelte-format` re-baselined for the formatters' locale-chain memo

COM-207 memoizes the locale list the formatters hand `Intl`, per frozen fallback chain and locale,
so a format call with a fallback chain allocates nothing. Measured with one
`node scripts/size-check.mjs` run under Node 24.22.1 after `pnpm build`, against the same run on
the base (`8d0db18d`): every row that imports a formatter grew by 88…106 B min+gz, the other core
rows by 12…23 B (the frozen chain on the instance). All of them fit their budgets except
`fw-svelte-format`, the one-formatter row, which went 558 → 761 B min and 362 → 462 B min+gz
against a 381 B budget: the memo is ~100 B on a ~360 B row. Without the memo the row stays in
budget, but the base measured the formatters 13–25 % slower than 0.7.0 with a fallback locale,
so the bytes ship. Only that row was re-baselined, to 462 B with a budget of 486 B; the rest keep
their baselines.

## 2026-10-27: the 0.8 core rebuild, lot 1a — design ceilings and MIGRATION_PENDING rows

Lot 1a replaced `@comvi/core` with the compile and locale foundation of the 0.8 core
(`.omc/plans/reference-i18n-design.md` rev 3, synthesis §4). Two rules come with it.

**Design ceilings.** A row may carry `ceilingBytes`, the ceiling the design sets for that graph
(R3-10). `gzipBudgetBytes` is then `min(ceilingBytes, ceil(baseline × 1.05))`, and the gate fails a
row whose budget exceeds its ceiling, so re-baselining cannot walk past the design. The 1a rows
derive their ceilings with the R3-10 method — measured prototype bytes plus the estimated deltas,
× 1.15, rounded up to 50 — applied to the part of the core that exists:

| Row               | Ceiling derivation                                                                                                    | Measured (Node 24) |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `core-compile`    | S7 compile slice 1,372 (scanner, ICU, offset, plain-`{x}` formatting, tags) + S1 cache 200 + review fixes 117 → 2,000 | 1,873              |
| `core-1a-surface` | the above + S7 canonicalize/parent/negotiate/dir 395 → 2,450                                                          | 2,383              |
| `core-locale`     | none of its own: R3-10 prices the locale code as marginal bytes inside core                                           | 577                |
| `core-negotiate`  | none of its own (as `core-locale`)                                                                                    | 468                |

**Where `core-compile` stands against the prototype.** S7 priced the compile slice at 1,372 B and
S1 the cache at ~200 B: 1,572 B. The first 1a build measured 1,756 B, 184 B over that price, which
was not attributed line by line. Candidates, not checked against the S7 sources: the ListFormat
branch for `string[]`, the DateTimeFormat branch keyed by time zone, the R4-7 output probe in front
of the integer fast path, the fail-soft syntax renderer and the first-wins rule for repeated
selectors. The 1a review fix pass then added 117 B, measured: 37 B for the production `useFormat()`
hint on `{x, number|date|time}` (the one message production ships, R3-8) and 80 B for own-property
parameter reads, ICU `Pattern_White_Space`, ICU's number syntax for `=N` and `offset:`, and the
invalid-Date guard. The ceilings above take those 117 B through the same × 1.15.

**What was left under R3-10.** `pnpm size` printed an informational line for each entry of
`designCeilings`: `core + ICU ≤ 3,250` against `core-1a-surface`, i.e. 867 B for the instance of
lot 1b. Lot 1b replaced both with the gated `core-icu` and `core-icu-cdn` rows (below).

The S7 compile slice was re-measured from the prototype sources
(`lot0/s7/src/{parse,icu,fmt,tags}.js`, every flag on except `F_ICUFMT`/`F_SKEL`): 1,372 B, against
2,668 B for core + ICU + tags. The four 0.7 core rows (`core-base`, `core-base-icu`,
`core-base-devtools`, `core-full-composite`) are gone with the 0.7 API (synthesis §4.3); lot 1b adds
the core + ICU (≤ 3,250) and core + ICU + `cdn()` (≤ 3,750) rows.

**MIGRATION_PENDING rows.** A row whose entry names a package listed in
`tooling/migration-pending.mjs` is printed as `skipped` with the reason and is not measured: that
package does not build against the new core yet. The row and its baseline stay, so the lot that
rebuilds the package removes its entry from the list and the row is gated again, against the
recorded 0.7 baseline until it is re-baselined.

## 2026-10-27: lot 1b — the instance rows, and the R3-10 ceilings it cannot meet

One `node scripts/size-check.mjs` sweep under Node v24.22.1 after `TURBO_FORCE=true pnpm build`.
New rows: `core-icu` (createI18n + `t()` with `{name}` + a plural), `core-icu-cdn` (+ `cdn()`),
`core-icu-devtools`, `core-devtools` (the subpath alone, ceiling 1,300), `core-format`,
`core-plugins`. `core-1a-surface` and the `designCeilings` list are gone (the graph they
stood in for is now gated). `core-compile` was re-baselined: 1,873 → 1,931 B (+58: numeric-string
plural counts, `param` on `missing_param`, the per-message plural rules memo, the string fast
path in value formatting); its budget is the 2,000 ceiling.

**`core-icu` and `core-icu-cdn` are red, by the rule.** Their budgets are the owner's R3-10
ceilings (3,250 and 3,750), which may not be raised; they measure 4,111 and 4,466 B. Lot 1b
stops here and reports blocked. The accounting, measured on the lot-1b sources with the
same esbuild settings (cumulative, min+gz; the sources read ~20 B above the dist rows):

| Graph                                                                            | Bytes |      Δ | R3-10 price (S7 / S1 / S9)                                                                                                      |
| -------------------------------------------------------------------------------- | ----: | -----: | ------------------------------------------------------------------------------------------------------------------------------- |
| compile: scanner, ICU, value formatting, `compile`/`render`/`lookup`/`recordFor` | 1,945 |  1,945 | compile slice 1,372 + cache ~200 = 1,572 → **+373** (1a review fixes +117, unattributed 1a +184, 1b +58, the rest gzip context) |
| + `inherit` (patch flattening)                                                   | 2,000 |    +55 | in the cache price above                                                                                                        |
| + `canonicalize`, `parents`, `dir`                                               | 2,261 |   +261 | canon + parent 153, dir 127 = 280                                                                                               |
| + state and slots (`mk`, `layer`, `find`, `put`), default reporter               | 2,532 |   +271 | snapshot +140                                                                                                                   |
| + the instance (core-icu row)                                                    | 4,111 | +1,579 | S7 features ≈ 364 + loading ≈ 240 (design estimate)                                                                             |
| + `cdn()` (core-icu-cdn row)                                                     | 4,466 |   +355 | cdn-v1 +333 (S5)                                                                                                                |

Inside the instance, the cost of each feature, measured by removing it alone from the final
source (bytes saved): per-call ns/locale and defaultParams on the fast path 48, `has()` 48,
plugins (setup, transactional rollback, teardowns) 50, `invalid_locale` checks 51, partial
failure 41, aborting loads outside the new chain 38, the internal seam 28, `ready` 26,
per-locale fallback lists 26, `defaultParams`/`setDefaultParams` 25, per-call `{ ns, locale }`
24, `fallback_used` 18, `add()` aborting a pending load 12, missing-key suppression while
loading 12, `missing` 12, negative-cache retry 10, bounded chain memo 10 — ≈ 480 B together.
A floor instance with only `t()`, the parent chain, layered `add()` and publish already
measures **2,578 B**, leaving 672 B under 3,250 for everything above plus loading,
`setLocale`, `destroy` and the state machine: no set of cuts that keeps the mandated features
reaches the ceiling. The rev-4 synthesis ceilings (3,600 / 4,050) would be missed by ~510 and
~420 B as well. The owner decides: raise the R3-10 rows, drop features, or a new ceiling.

`core-devtools` measures 1,298 B (2 under its ceiling): the subpath alone, discovery plus the
editor loader. Added to `core-icu` it costs 1,105 B (`core-icu-devtools`), against the 1,264 B
`devtools()` cost of 0.6.0 (`core-base-devtools` − `core-base`).
