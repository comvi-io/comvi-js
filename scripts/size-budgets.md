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
`react-icu-cdn` (the main path on React, with the binding increment cap over `core-icu-cdn`);
per framework
`fw-{react,solid,svelte,vue}-{default,full-composite}`, `fw-svelte-format`; `fw-next-client-default`,
`fw-next-server-default-loader`, `fw-next-server-provider`, `fw-next-root-composed`, `fw-next-root-devtools`, `fw-next-plugin-node`, `fw-next-middleware-edge`, `fw-nuxt-client-default`,
`fw-nuxt-full-composite`, `fw-nuxt-i18n`; the platform
path `plugin-fetch-loader`, `plugin-fetch-loader-api` (`platform-path-react` is replaced by
`react-icu-cdn` in lot 1c).

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
stood in for is now gated). Re-baselined: `core-compile` 1,873 → 1,930 B (numeric-string
plural counts, `param` on `missing_param`, the per-message plural rules memo, the string fast
path in value formatting, the Intl locales list; its budget is the 2,000 ceiling),
`core-locale` 577 → 576 and `core-negotiate` 468 → 490 B (one process-level memo for
`canonicalize`, `parents` and likely subtags: the constructor went from 8.4 to 3.1 µs).

**`core-icu` and `core-icu-cdn` are red, by the rule.** Their budgets are the owner's R3-10
ceilings (3,250 and 3,750), which may not be raised; they measure 4,142 and 4,492 B. Lot 1b
reports blocked here. The accounting, measured on the lot-1b sources with the same esbuild
settings (cumulative, min+gz; the sources read ~15 B above the dist rows):

| Graph                                                                            | Bytes |      Δ | R3-10 price (S7 / S1 / S9)                                                                                             |
| -------------------------------------------------------------------------------- | ----: | -----: | ---------------------------------------------------------------------------------------------------------------------- |
| compile: scanner, ICU, value formatting, `compile`/`render`/`lookup`/`recordFor` | 1,944 |  1,944 | compile slice 1,372 + cache ~200 = 1,572 → **+372** (1a review fixes +117, unattributed 1a +184, 1b +57, gzip context) |
| + `inherit` (patch flattening)                                                   | 1,998 |    +54 | in the cache price above                                                                                               |
| + `canonicalize`, `parents`, `dir` (memoized)                                    | 2,278 |   +280 | canon + parent 153, dir 127 = 280                                                                                      |
| + state and slots (`mk`, `layer`, `find`, `put`), default reporter               | 2,551 |   +273 | snapshot +140                                                                                                          |
| + the instance (core-icu row)                                                    | 4,142 | +1,591 | S7 features ≈ 364 + loading ≈ 240 (design estimate)                                                                    |
| + `cdn()` (core-icu-cdn row)                                                     | 4,492 |   +350 | cdn-v1 +333 (S5)                                                                                                       |

Inside the instance, the cost of each feature, measured by removing it alone from the final
source (bytes saved): `has()` 50, the compiled-message fast path with params 50,
`invalid_locale` checks 49, plugins (setup, transactional rollback, teardowns) 46, partial
failure 39, aborting loads outside the new chain 37, the internal seam 26, `ready` 26,
`defaultParams`/`setDefaultParams` 25, per-call `{ ns, locale }` 25, per-locale fallback lists
22, `fallback_used` 17, `add()` aborting a pending load 13, negative-cache retry 13, missing-key
suppression while loading 11, `missing` 11, bounded chain memo 11 — ≈ 470 B together. A floor
instance with only `t()`, the parent chain, layered `add()` and publish measures **2,658 B**,
leaving 592 B under 3,250 for everything above plus loading, `setLocale`, `destroy` and the
state machine: no set of cuts that keeps the mandated features reaches the ceiling. The
rev-4 synthesis ceilings (3,600 / 4,050) would be missed by ~540 and ~440 B as well. The
owner decides: raise the R3-10 rows, drop features, or a new ceiling.

`core-devtools` measures 1,298 B (2 under its ceiling): the subpath alone, discovery plus the
editor loader. Added to `core-icu` it costs 1,099 B (`core-icu-devtools`), against the 1,264 B
`devtools()` cost of 0.6.0 (`core-base-devtools` − `core-base`).

### 2026-10-27: the lot-1b review fix pass

One sweep under Node v24.22.1 after `TURBO_FORCE=true pnpm build`. The fixes the two reviews
asked for cost bytes on the owner rows, which stay red against the unchanged R3-10 ceilings:
`core-icu` 4,142 → **4,304 B** (+162; ceiling 3,250, 1,054 over) and `core-icu-cdn` 4,492 →
**4,745 B** (+253; ceiling 3,750, 995 over), the last 10 B of each for the canonical tag kept on the
state so the `t()` fast path with params skips the chain lookup (0.057 → 0.045 µs, now below 0.7).
Measured on the sources by reverting one fix at a time (min+gz, `core-icu`; small fixes interact through gzip, so the parts do not sum exactly):

| Fix (review item)                                                                     | Bytes |
| ------------------------------------------------------------------------------------- | ----: |
| partial failure counts the target's own chain (`de-AT` → `de`)                        |   +21 |
| `fallbackLocale` copied at construction                                               |   +21 |
| `ready` memoized per set of flights, shared resolved promise                          |   +11 |
| `add()` publishes only when the store changed                                         |   +10 |
| reporter isolation (a throwing `onError`)                                             |   +10 |
| `add()` of the slot's own catalog is a no-op (`layer`)                                |    +7 |
| obsolete loads pruned when a switch completes                                         |    +5 |
| `defaultParams` per snapshot (copy, view, destroy guard)                              |    +4 |
| missing-key wait on every load of the namespace; deaf-loader abort                    |    +4 |
| re-ensure loop mid-switch, one publish per start (not separable: reverting adds code) |   n/a |
| `Core.o`, `now`/`formats` reach `/format` through it, the rest                        |   ≈ 0 |

`cdn()` itself grows by 91 B (350 → 441 over `core-icu`): the R3-12 `fallback` option, the race
of the whole request (body included) against the timeout and the caller's abort, and the
prototype-free copy of the fallback map. A module-level `Promise.resolve()` for `ready` is
annotated pure, so `core-compile` (the internal entry) does not carry it (1,931 B).

Re-baselined in the same sweep: `core-compile` 1,931, `core-locale` 578 (607), `core-icu-devtools`
5,398 (5,668; `devtools()` adds 1,094 B), `core-devtools` 1,296 (ceiling 1,300: the idempotence
guard and the SSR id were paid for by folding `exposeGlobal` into one `??`), `core-format` 4,842
(5,085: named formats and `formatRelativeTime(i18n, date, now?)` of design §3.3, and a per-chain
formatter memo for default options that took `formatNumber` from +26 % to ≈ +10 % against 0.7),
`core-plugins` 4,876 (5,120: `detect()` is a plugin again).

The verdict of the lot-1b section stands and is now 1,054 / 995 B wide: no cut that keeps the
mandated features reaches 3,250 / 3,750. The owner decides (raise R3-10, drop features, or a new
measured ceiling); lot 1b stays **blocked** on these two rows only.

### 2026-10-27: size pass on the lot-1b instance

Two independent byte hunts read the lot-1b graph against the 2,489 B prototype (S7 `icu`, all
flags except `F_ICUFMT`/`F_SKEL`). Every cut either hunt marked SAFE was re-measured here and
applied when it saved bytes, kept every test green and changed no behaviour. One sweep under Node
v24.22.1 after `TURBO_FORCE=true pnpm build`: `core-icu` 4,304 → **4,253 B** (−51) and
`core-icu-cdn` 4,745 → **4,670 B** (−75). Both rows stay red: 1,003 / 920 B over the unchanged
R3-10 ceilings. Re-baselined in that sweep: `core-compile` 1,913 (budget = ceiling 2,000),
`core-icu-devtools` 5,344 (5,612), `core-format` 4,789 (5,029), `core-plugins` 4,826 (5,068).
`core-locale`, `core-negotiate` and `core-devtools` did not move (±1 B gzip) and keep theirs.

Per commit, cumulative, measured on the sources with the gate's esbuild settings (the source
bundle reads 18–21 B above the dist row):

| Cut                                                                          | `core-icu` | `core-icu-cdn` |
| ---------------------------------------------------------------------------- | ---------: | -------------: |
| before (0ecc74ec)                                                            |      4,325 |          4,764 |
| optional chaining for the store, primary-record and env guards               |  4,306 −19 |      4,748 −16 |
| `t()` fast path lets `render()` take a static string                         |   4,299 −7 |       4,741 −7 |
| fallback-list test relies on the JSON copy never being null                  |   4,295 −4 |      4,731 −10 |
| partial failure as `every()` over the active namespaces                      |   4,287 −8 |       4,722 −9 |
| one shared `noop`; production `defaultOnError` is it                         |   4,286 −1 |       4,721 −1 |
| compile cache: `key ?? template`, `SYNTAX = {}`, `EMPTY = Object.freeze({})` |   4,277 −9 |       4,716 −5 |
| `missing_param` builds its `message` in development only                     |   4,276 −1 |       4,713 −3 |
| production syntax failures call `fail()` with no argument                    |   4,274 −2 |       4,711 −2 |
| the plural-ancestry flag is development-only                                 |   4,272 −2 |       4,708 −3 |
| `N(...from)` copies; one null-prototype copy helper (also in `cdn()`)        |   4,271 −1 |       4,703 −5 |
| `cdn()`: one identifier regex (`.`/`..` in a lookahead)                      |    4,271 0 |       4,700 −3 |
| `cdn()`: body read chained on `fetch()`, no async IIFE                       |    4,271 0 |       4,695 −5 |
| `cdn()`: no guard on the Loader contract's required `signal`                 |    4,271 0 |       4,691 −4 |
| **dist, the gate**                                                           |  **4,253** |      **4,670** |

Tried and not applied (they grew the rows or broke a rule): one `slot()` reader in state.ts
(+2 / +4 over plain optional chaining); token delimiters and Pattern_White_Space in one regex (+1
/ +3); `fail(__DEV__ ? m : undefined)` (+1 / +3 over the block form); the expression form
`__DEV__ ? fail(m) : fail()` (3 B smaller, fails `no-unused-expressions`); a development-only key
for tag parts (+1 / 0); `y(load(…))` in `get()` (one microtask fewer, fails a hardening test);
Terser preprocessing (+17 / +16). The `perf.mjs --compare-ref 0ecc74ec` run after the pass moved
no case by more than 5 % (`add()` over 10K −8 %, every `t()` case −2 %).

**What the gap to the prototype is.** The first hunt puts about 98 % of the ~1.8 kB on
behaviour the prototype did not have: rich-text tags (163 B measured), the catalog-identity
compile cache with layered patches and inheritance, syntax validation and fail-soft rendering,
locale validation and the memos, the loading state machine (negative cache, partial failure,
prune, re-ensure, abort settlement, `ready` memo, plugin transactions, reporter isolation), and
the full `cdn()` (fallback, whole-request timeout race, `next`, messages). The second hunt agrees
that the accidental share is small (the cuts above) but did not establish an irreducible floor
for the rest; the owner options below are what removing behaviour buys.

**Owner options**, each measured alone on a throwaway commit over the pass's tip (dist, bytes
saved `core-icu` / `core-icu-cdn`; tests failing out of 1,275). The `cdn()` rows and the three
stacks were re-measured over the fix-pass tip (36a1de93, base 4,260 / 4,682, 1,277 tests); the
other rows touch neither `cdn.ts` nor `missing_param` and carry over:

| Option                                                                        |   Saves | Tests | Trade-off                                          |
| ----------------------------------------------------------------------------- | ------: | ----: | -------------------------------------------------- |
| tags out of the base (contradicts R3-11)                                      | 163/163 |    29 | rich text becomes opt-in                           |
| no automatic Date and `string[]` formatting in `{x}`                          |   85/85 |    10 | callers preformat; `timeZone` dead in core         |
| no patch flattening / `inherit` (each `add()` recompiles its patch)           |   85/83 |     3 | `add()` O(patch) compile each time                 |
| no small-integer fast path + probe (every number through `Intl`)              |   54/57 |     0 | undoes the R4-7 perf path                          |
| no Date formatting alone                                                      |   54/55 |     8 |                                                    |
| no production `useFormat()` hint (contradicts R3-8)                           |   37/39 |     7 |                                                    |
| no per-message plural-rules memo                                              |   35/32 |     0 | one cache-key string per plural render             |
| no process-level locale memo                                                  |   34/35 |     0 | constructor 3.1 → ~8.4 µs                          |
| no `string[]` → ListFormat                                                    |   32/34 |     2 |                                                    |
| no `catalogs` option                                                          |   29/25 |     7 | namespaces only via `add()` / loader               |
| short production `setLocale` RangeError (message = the locale)                |    25/9 |     0 | development message unchanged                      |
| no SyntaxId layer in the compile cache                                        |   25/22 |     1 | "id is always 0" generality                        |
| no numeric-string plural counts (contradicts the 27.10 owner decision)        |   24/22 |    33 |                                                    |
| no `has({ fallback: false })`                                                 |   19/20 |     1 |                                                    |
| unbounded per-instance chain memo                                             |   18/21 |     0 | per-call `{ locale }` from user input grows memory |
| no `Object.freeze` on patch/flattened catalogs                                |     8/7 |     0 | a mutated view catalog could desync its record     |
| `structuredClone` for the `fallbackLocale` copy                               |     5/5 |     0 | 2022 browser floor for core                        |
| `cdn()`: no `fallback` (contradicts R3-12)                                    |    5/55 |     4 |                                                    |
| `cdn()`: timeout covers the response only, not the body                       |    0/35 |     1 | a body that never settles hangs the load           |
| `cdn()`: errors without URL / timeout text                                    |    0/22 |     7 | "HTTP 404" without the URL                         |
| `cdn()`: no `next` passthrough                                                |     0/8 |     1 | Next.js fetch cache options gone                   |
| `cdn()`: the three above together                                             |    0/66 |     8 |                                                    |
| `cdn()`: the three above plus no `fallback`                                   |   5/121 |    12 |                                                    |
| the perf/robustness six together (fast path, two memos, bound, freeze, clone) | 155/150 |     0 |                                                    |
| all feature/DX options except the three that contradict R3                    | 434/484 |    61 | 3,826 / 4,198: still 576 / 448 over                |
| everything above, R3-8/11/12 included                                         | 623/729 |   100 | 3,637 / 3,953: still 387 / 203 over                |

No combination reaches 3,250 / 3,750. The verdict of the lot-1b section stands at 1,010 / 932 B
after the fix pass below:
the owner decides between raising the R3-10 rows, dropping features from the list above, or a
new measured ceiling.

#### 2026-10-27: size-pass review fix pass

The review of the size pass found three cuts that changed behaviour, so they are undone. One
sweep under Node v24.22.1 after `TURBO_FORCE=true pnpm build`: `core-icu` 4,253 → **4,260 B**
(+7), `core-icu-cdn` 4,670 → **4,682 B** (+12), `core-compile` 1,913 → 1,920 B, and
`core-icu-devtools` 5,350, `core-format` 4,794, `core-plugins` 4,830. These are all inside the
budgets set in the size pass, so no row is re-baselined.

- `cdn()` reads the body in an async IIFE again. `fetch().then(async …)` takes more microtasks,
  so an abort two microtasks after a settled body rejected the load instead of returning the
  catalog.
- `cdn()` guards `signal` again. A direct call without one rejected with a `TypeError` and left
  the timeout armed.
- Production `missing_param` reports carry an own `message: undefined` key again, as at
  0ecc74ec, so a reporter that spreads the error over defaults sees the same object.

`tests/cdn/loader.test.ts` pins the first two, and the production report test is now
`toStrictEqual`. All three failed on 7b517b4a.

### 2026-10-27: R3-13 — owner sets the core ceilings

The size pass showed the R3-10 ceilings cannot be met with the features R3-8…R3-12 keep:
every option on the owner list stacked (including the ones contradicting R3-8/11/12) gives
3,637 / 3,953 B, still 387 / 203 B over. The owner kept every decision and took one cut,
the unused SyntaxId layer in the compile cache (`recordFor(catalog)` keyed by catalog alone).

| Row          | Before | After | New ceiling = ceil(after × 1.05) |
| ------------ | ------ | ----- | -------------------------------- |
| core-icu     | 4,260  | 4,237 | 4,449                            |
| core-icu-cdn | 4,682  | 4,661 | 4,895                            |
| core-compile | 1,920  | 1,904 | 2,000 (unchanged)                |

Node v24.22.1, `TURBO_FORCE=true pnpm --filter @comvi/core build`, `node scripts/size-check.mjs`.

## 2026-10-27: lot 1c — the React binding and its +500 B increment cap

`react-icu-cdn` is `core-icu-cdn`'s graph on React: `createI18n` + `cdn()` + `<I18nProvider>` +
`useI18n()` + `t()` with `{name}` and a plural. Its ceiling is `core-icu-cdn`'s 4,895 + 500 =
**5,395 B**, and the row declares `increment: { over: "core-icu-cdn", maxBytes: 500 }`: the
size gate fails the row when it adds more than 500 B over `core-icu-cdn` measured in the same
run (R3-10's provisional binding cap, kept HARD by the owner). Seen red with `maxBytes: 400`
(`+468 B over core-icu-cdn vs cap +400 B`, exit 1).

The first full binding measured **+964 B**. Itemized marginal costs (gz, removed one at a time
from the full binding, Node v24.22.1, esbuild 0.28.0):

| piece                                                                                       | B    |
| ------------------------------------------------------------------------------------------- | ---- |
| floor: provider + `useSyncExternalStore` + context + `translate` + Fragment + react imports | ~240 |
| locale handover (`useState`/`useRef`/layout effect/`view()`/`add`/`setLocale`)              | ~350 |
| bound `<T>` from `useI18n(ns)` (keeps `<T>` in every app)                                   | 52   |
| tag-handler wrap (one node for the children: no key warnings)                               | 41   |
| `loading` / `suspense` gate                                                                 | 41   |
| `/internal` instance check (production)                                                     | 27   |
| out-of-provider error text (production)                                                     | 26   |
| `isLoading`                                                                                 | 21   |
| `dir` + `setLocale` + `i18n` fields                                                         | 15   |
| `ns` activation effect                                                                      | 13   |
| `useMemo` of the hook's result                                                              | 7    |

Taken: the handover moved into its own component, `<I18nHandover catalogs locale>` (design §3.4's
provider has no handover props; an app without a server payload carries none of it); both
diagnostics are development-only (the `development` export condition, as core); bound `<T>` is
not shipped (`<T ns>` stays). Kept: everything else above. Result, one sweep after
`TURBO_FORCE=true pnpm build`:

| row                     | gzip B | budget | ceiling | note                                               |
| ----------------------- | ------ | ------ | ------- | -------------------------------------------------- |
| react-icu-cdn           | 5,129  | 5,386  | 5,395   | **+468 B** over core-icu-cdn (cap 500)             |
| fw-react-default        | 4,668  | 4,902  | —       | 0.7: 7,606                                         |
| fw-react-full-composite | 8,047  | 8,450  | —       | 0.7: 13,526; every export + cdn, plugins, devtools |

`platform-path-react` (0.7 API: `cdnLoader` from `@comvi/plugin-fetch-loader`) is removed;
`react-icu-cdn` is the React platform path now.

## 2026-10-27: lot 1e — the editor seams (R3-14) and the thin `/devtools` (R3-15)

One sweep, `node scripts/size-check.mjs` after `TURBO_FORCE=true pnpm build`, Node v24.22.1;
the "before" column is the same command on 925b5bab (the lot 1c fix pass).

| row                     | before | after | Δ    | budget | ceiling | note                                        |
| ----------------------- | ------ | ----- | ---- | ------ | ------- | ------------------------------------------- |
| core-icu                | 4,285  | 4,342 | +57  | 4,449  | 4,449   | R3-13 ceiling unchanged                     |
| core-icu-cdn            | 4,711  | 4,774 | +63  | 4,895  | 4,895   | R3-13 ceiling unchanged                     |
| core-icu-devtools       | 5,386  | 4,778 | −608 | 5,017  | 5,017   | devtools **+436 B** over core-icu (cap 500) |
| core-devtools           | 1,296  | 613   | −683 | 644    | 644     | the subpath alone                           |
| core-format             | 4,824  | 4,882 | +58  | 5,127  | —       | the hook, H8 and H3 in the instance         |
| core-plugins            | 4,862  | 4,920 | +58  | 5,166  | —       | the hook, H8 and H3 in the instance         |
| react-icu-cdn           | 5,186  | 5,241 | +55  | 5,395  | 5,395   | **+467 B** over core-icu-cdn (cap 500)      |
| fw-react-default        | 4,720  | 4,778 | +58  | 5,017  | —       |                                             |
| fw-react-full-composite | 8,170  | 7,603 | −567 | 7,984  | —       | composes `devtools()`                       |

"After" is the sweep after the lot 1e fix pass (review items: the load landing under `add()`
flattened into a base, compiled reuse across patch and flatten, `state().ns`, the strict
SemVer check, the `mark` guards, an `Error` on script failure). The first 1e sweep had
core-icu 4,335, core-icu-cdn 4,758, core-icu-devtools 4,691 (+356), core-devtools 527.

Re-baselined from this sweep: every row in the table (the two R3-13 rows keep their ceiling as
budget; `react-icu-cdn`'s budget is its ceiling, since ceil(5,241 × 1.05) is above it).
`core-icu-devtools` and `core-devtools` get `ceilingBytes` = budget = ceil(measured × 1.05)
(R3-15), and `core-icu-devtools` declares `increment: { over: "core-icu", maxBytes: 500 }`,
the R3-15 target for what `plugins: [devtools()]` adds. Seen red: the 0.7 failure-code texts
planted back into the hook gave `core-icu-devtools` 4,995 B (+660 over `core-icu`, cap +500)
and `core-devtools` 826 B, size-check exit 1.

The base rows' +55…+63 B, measured by removing one piece at a time (core-icu):

| piece                                                                                                    | B (core-icu) |
| -------------------------------------------------------------------------------------------------------- | ------------ |
| H4 hook: `State.mk` + no `pr` under a hook, `translate` calling it after the `markers` opt-out, `Core.m` | +37          |
| (inside the +37) `add()` no longer looking up and aborting a flight of its pair (H8)                     | saves bytes  |
| H8 under-layering: a load landing into a pair `add()` filled goes under it (`put(…, u)`)                 | +13          |
| fix pass: that landing flattened into a base (the fast path survives), compiled reuse base→patch (H3)    | +5           |
| fix pass: `inherit(…, keys)` walking only a patch's keys                                                 | +2           |

**Over the E0 envelope.** E0 allows the H4 hook +40 B on the base rows; H4 alone is +37, but
the base rows grew +57 (core-icu) and +63 (core-icu-cdn) with H8 and H3, which the editor plan
estimated at 0 B (§5). Both R3-13 ceilings still hold (4,342 ≤ 4,449; 4,774 ≤ 4,895). Whether
the +40 covers H4 alone or the whole base growth is the owner's call; it is recorded in the
lot 1e hand-over and the orchestrator report.

`/devtools` went from 1,296 B to 613 B alone (+1,101 → +436 B over
`core-icu`): one queue entry, the handle's thin delegates and a `<script>` promise, with CSP
diagnostics, the timeout, cross-copy dedupe, the hourly salt, the v1 registry, hook probes
and minted ids moved to the extension and the editor (lot 8). `core-compile`, `core-locale`
and `core-negotiate` did not move (±1 B) and keep their baselines.

**Owner decision 28.10.2026: accepted.** The +57 B (`core-icu`) and +63 B (`core-icu-cdn`) of
lot 1e over the 1c fix pass stand: the bytes above the E0 H4 envelope of +40 B are the H8
under-layering and the H3 compiled reuse, correctness fixes. Not a finding to re-open.

## 2026-10-28: lot 1d part 1 — R3-17, the missing-key path, namespaces still coming

One sweep, `node scripts/size-check.mjs` after `TURBO_FORCE=true pnpm build`, Node v24.22.1;
"before" is the lot 1e baseline (322a14b4, re-measured: identical).

| row                     | before | after | Δ   | budget | ceiling | note                                    |
| ----------------------- | ------ | ----- | --- | ------ | ------- | --------------------------------------- |
| core-compile            | 1,913  | 1,853 | −60 | 1,946  | 2,000   | no Intl path for a plain `{x}`          |
| core-icu                | 4,342  | 4,298 | −44 | 4,449  | 4,449   | R3-13 ceiling unchanged                 |
| core-icu-cdn            | 4,774  | 4,730 | −44 | 4,895  | 4,895   | R3-13 ceiling unchanged                 |
| core-icu-devtools       | 4,778  | 4,730 | −48 | 4,967  | 5,017   | devtools **+432 B** over core-icu (500) |
| core-format             | 4,882  | 4,853 | −29 | 5,096  | —       |                                         |
| core-plugins            | 4,920  | 4,876 | −44 | 5,120  | —       |                                         |
| react-icu-cdn           | 5,241  | 5,204 | −37 | 5,395  | 5,395   | **+474 B** over core-icu-cdn (cap 500)  |
| fw-react-default        | 4,778  | 4,737 | −41 | 4,974  | —       |                                         |
| fw-react-full-composite | 7,603  | 7,578 | −25 | 7,957  | —       |                                         |

Re-baselined from this sweep: every row in the table, budget = ceil(measured × 1.05), never
above the row's ceiling (`core-icu`, `core-icu-cdn` and `react-icu-cdn` keep their ceiling as
budget). No ceiling and no cap moved. `core-locale`, `core-negotiate` and `core-devtools` did
not move (±2 B) and keep their baselines.

By piece, measured at each commit of the lot (`core-icu` / `core-icu-cdn` / React increment
over `core-icu-cdn`):

| piece                                                                                  | core-icu | core-icu-cdn | React incr. |
| -------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| R3-17: a plain `{x}` prints `String(value)`; no NumberFormat/DateTimeFormat/ListFormat | −76      | −80          | +473        |
| missing key: production without `onError` skips the report (`h != noop`)               | +5       | —            | —           |
| a namespace still coming (`coming`: not active, a loader, no catalog of the locale)    | +25      | +26          | +474        |

The first missing-key change (d494f9a9) also kept a memo of the last chain and a `quiet`
reporter: +41 B on `core-icu` for ~12 ns per missing key; the memo (+23 B) and the reporter
swap went in 45589f67, the `h != noop` guard stayed. The binding-local alternative for
the coming namespace (a state copy with the namespace added to `ld`, built in the hook) cost
the React row +52 B, +520 over `core-icu-cdn` against the cap of +500, and was not taken.
