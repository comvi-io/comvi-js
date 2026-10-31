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

> **Owner-accepted growth (policy clarification, 2026-10-30).** When the owner accepts a size
> increase for functionality, the affected `ceilingBytes` (and the binding `increment.maxBytes`
> cap) is set to `ceil(measured × 1.02)`. Budgets keep the existing rule
> `min(ceiling, ceil(measured × 1.05))`. No byte golfing is done to fit under an older number, and
> ceilings are raised only by the owner, never by the executor.

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
`react-icu-cdn` and `vue-icu-cdn` (the main path on React and on Vue, each with the binding
increment cap over `core-icu-cdn`);
per framework
`fw-{react,solid,svelte,vue}-{default,full-composite}`, `fw-svelte-format`; `fw-next-client-default`,
`fw-next-server-default-loader`, `fw-next-server-provider`, `fw-next-root-composed`, `fw-next-root-devtools`, `fw-next-plugin-node`, `fw-next-middleware-edge`, `fw-nuxt-client-default`,
`fw-nuxt-full-composite`, `fw-nuxt-i18n` (`platform-path-react` is replaced by `react-icu-cdn` in
lot 1c; the `plugin-fetch-loader` and `plugin-fetch-loader-api` rows left with the package in lot 2c,
the platform path is `core-icu-cdn`).

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

`plugin-fetch-loader` and `plugin-fetch-loader-api` were a pair (the package root and its `/api`)
until lot 2c removed the package; their history stays in the dated sections below.

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

## 2026-10-28: lot 1d review fix pass

`node scripts/size-check.mjs` after `TURBO_FORCE=true pnpm build`, Node v24.22.1; "before" is
the lot 1d part 1 baseline (ecba8a3a).

| row                     | before | after | Δ   | budget | ceiling | note                                    |
| ----------------------- | ------ | ----- | --- | ------ | ------- | --------------------------------------- |
| core-compile            | 1,853  | 1,857 | +4  | 1,950  | 2,000   | `{x}` list of numbers/Dates → String    |
| core-locale             | 578    | 588   | +10 | 618    | —       | memo stores after computing (rollover)  |
| core-negotiate          | 490    | 498   | +8  | 523    | —       | same                                    |
| core-icu                | 4,298  | 4,376 | +78 | 4,449  | 4,449   | R3-13 ceiling unchanged; 73 B headroom  |
| core-icu-cdn            | 4,730  | 4,815 | +85 | 4,895  | 4,895   | R3-13 ceiling unchanged; 80 B headroom  |
| core-icu-devtools       | 4,730  | 4,815 | +85 | 5,017  | 5,017   | devtools **+439 B** over core-icu (500) |
| core-devtools           | 613    | 625   | +12 | 644    | 644     | 64-character version guard              |
| core-format             | 4,853  | 4,924 | +71 | 5,171  | —       |                                         |
| core-plugins            | 4,876  | 4,951 | +75 | 5,199  | —       |                                         |
| react-icu-cdn           | 5,204  | 5,284 | +80 | 5,395  | 5,395   | **+469 B** over core-icu-cdn (cap 500)  |
| fw-react-default        | 4,737  | 4,807 | +70 | 5,048  | —       |                                         |
| fw-react-full-composite | 7,578  | 7,672 | +94 | 8,056  | —       |                                         |

Re-baselined: every row in the table, budget = ceil(measured × 1.05), never above the row's
ceiling. No ceiling and no cap moved. The bytes are review fixes (correctness, not features),
by file on `core-icu`: `instance.ts` +49 (own-property per-call options, an invalid per-call
locale reported once through the chain memo, `load()` publishing a namespace joining the active
set, no marking after `destroy()`, `defaultParams: {}` as none, an empty namespace as `default`), `state.ts` +29 (an `add()` of
messages the pair already renders keeps the slot — the handover render loop), `fmt.ts` +7,
`locale.ts` +6. The React increment over `core-icu-cdn` went DOWN (+474 → +469): the binding
gained the prototype-free `Ts` cache, the handover chunk (not in the row) its own-key loop.

Headroom for later lots: `core-icu` 73 B and `core-icu-cdn` 80 B under their R3-13 ceilings;
the React increment 31 B under its +500 B cap; devtools 61 B under its +500 B target.

## 2026-10-28: lot 2c — the catalog store, `api()`, the parent-chain report; two packages leave

`node scripts/size-check.mjs` after `TURBO_FORCE=true pnpm build`, Node v24.22.1; "before" is
the lot 1d review fix pass baseline (origin/next a3db1fc9).

| row                     | before | after | Δ   | budget | ceiling | note                                      |
| ----------------------- | ------ | ----- | --- | ------ | ------- | ----------------------------------------- |
| core-icu                | 4,376  | 4,413 | +37 | 4,449  | 4,449   | parent-chain report; 36 B headroom        |
| core-icu-cdn            | 4,815  | 4,886 | +71 | 4,895  | 4,895   | `/cdn` +473 B over core-icu; 9 B headroom |
| core-icu-devtools       | 4,815  | 4,858 | +43 | 5,017  | 5,017   | devtools +445 B over core-icu (500)       |
| core-format             | 4,924  | 4,965 | +41 | 5,214  | —       |                                           |
| core-plugins            | 4,951  | 4,994 | +43 | 5,244  | —       |                                           |
| react-icu-cdn           | 5,284  | 5,358 | +74 | 5,395  | 5,395   | +472 B over core-icu-cdn (cap 500)        |
| fw-react-default        | 4,807  | 4,849 | +42 | 5,092  | —       |                                           |
| fw-react-full-composite | 7,672  | 7,740 | +68 | 8,127  | —       |                                           |

Re-baselined: every row in the table, budget = ceil(measured × 1.05), never above the row's
ceiling. No ceiling and no cap moved. The `plugin-fetch-loader` and `plugin-fetch-loader-api`
rows (and their fixtures) are gone with the package.

The bytes, measured piece by piece on `core-icu-cdn` (cdn module alone, esbuild min+gz, beside the
same build of the lot 1d loader): the instance's parent-chain report (a parent's `load_failed` waits
for the locale's own load of the namespace) +36 B on every row with the instance; the loader +35 B —
the `fetch` and `store` options and the seam the store plugs into (a request function taking the
conditional headers, returning the catalog with its response). The store itself
(`createCatalogStore`, ~110 B) and `api()` are not in any row: an app that does not import them does
not ship them. A module-wide default store was measured at +248 B on this row before the cuts (its
store code alone ~110 B after them, cdn module measured on its own) and is not in the code: it is
over the R3-13 ceiling (`docs/design/catalog-store.md`). What the cuts were: no caller-signal race
in the store path (the instance's flight settles on its own signal), the 304 handled as a failure
that keeps the stored catalog, one promise per request instead of a race plus `finally`, the API
body picked in `api()`'s own `fetch` wrapper, and no listener removal or pre-aborted check on the
caller's signal.

Design §3.2's target, `/cdn` ≤ 400 B over core, is not met: +473 B (it was +439 B before this
lot). Headroom for later lots: `core-icu` 36 B and `core-icu-cdn` 9 B under their R3-13 ceilings;
the React increment 28 B under its +500 B cap; devtools 55 B under its +500 B cap.

## 2026-10-28: lot 2c review fix pass

Same command and Node (v24.22.1); "before" is the lot 2c table above.

| row                     | before | after | Δ   | budget | ceiling | note                                      |
| ----------------------- | ------ | ----- | --- | ------ | ------- | ----------------------------------------- |
| core-icu                | 4,413  | 4,423 | +10 | 4,449  | 4,449   | parent role re-bound per caller; 26 B     |
| core-icu-cdn            | 4,886  | 4,890 | +4  | 4,895  | 4,895   | `/cdn` +467 B over core-icu; 5 B headroom |
| core-icu-cdn-store      | —      | 5,055 | new | 5,308  | —       | cdn() + createCatalogStore(): +165 B      |
| core-icu-api            | —      | 5,413 | new | 5,684  | —       | api() + createCatalogStore()              |
| core-icu-devtools       | 4,858  | 4,866 | +8  | 5,017  | 5,017   | devtools +443 B over core-icu (500)       |
| core-format             | 4,965  | 4,973 | +8  | 5,222  | —       |                                           |
| core-plugins            | 4,994  | 5,003 | +9  | 5,254  | —       |                                           |
| react-icu-cdn           | 5,358  | 5,361 | +3  | 5,395  | 5,395   | +471 B over core-icu-cdn (cap 500)        |
| fw-react-default        | 4,849  | 4,858 | +9  | 5,101  | —       |                                           |
| fw-react-full-composite | 7,740  | 7,747 | +7  | 8,135  | —       |                                           |

Re-baselined: every row in the table, budget = min(ceil(measured × 1.05), ceiling). No ceiling and
no cap moved. The two new rows have no ceiling: they are server paths, not browser ones, and only
the owner sets ceilings; they put the store and `api()` under a gate for the first time.

The bytes: the instance's parent-chain report now re-binds a flight's parent role on every
`get()` (+10 B on `core-icu`, +7 to +9 B on the other rows with the instance); the cdn loader
refuses a signal that is already aborted (about +7 B, measured on its own) and settles the load from inside its request (`y()` in the async body, not
`.then(y)`), which restored the lot-1b microtask order at no cost. Cuts that paid for them: the
own controller's `onabort` instead of an `addEventListener`, `c.abort()` without the caller's
reason on the caller's abort (the AbortError `fetch` gives), the no-store path as
`(await load())[0]`. Not added, for want of bytes: removing the listener on the caller's signal
and disarming the timer when a caller aborts a transport that never settles (measured at +8 B and
+5 B; both documented in `cdn.ts`), and a module-wide default store (`core-icu-cdn-store` above is what it
costs: +165 B, over the 4,895 B ceiling — the owner's decision, see `docs/design/catalog-store.md`).

Design §3.2's target, `/cdn` ≤ 400 B over core, is still not met: +467 B (−6 B against the lot 2c
table). Meeting it needs 67 B of cuts in the loader or a new target from the owner. Headroom:
`core-icu` 26 B and `core-icu-cdn` 5 B under their R3-13 ceilings; the React increment 29 B under
its +500 B cap; devtools 57 B under its +500 B cap.

## 2026-10-28: lot 4 — the Vue binding and its +500 B increment cap

`vue-icu-cdn` is `core-icu-cdn`'s graph on Vue: `createI18n` + `cdn()` + `app.use(i18n)` +
`useI18n()` + `t()` with `{name}` and a plural, `vue` external. Its ceiling is `core-icu-cdn`'s
4,895 + 500 = **5,395 B** (the budget is the ceiling, below measured × 1.05), and the row
declares `increment: { over: "core-icu-cdn", maxBytes: 500 }`, the React rule of lot 1c. Seen red
with `maxBytes: 400` (`+492 B over core-icu-cdn vs cap +400 B`, `Size gate failed for:
vue-icu-cdn`).

The first full binding measured **+638 B**. Itemized marginal costs at +606 B (gz, each removed
alone from the built chunk, Node v24.22.1, esbuild through `size-check.mjs`):

| piece                                                                 | B   |
| --------------------------------------------------------------------- | --- |
| `<T>` and the bound `<T>` of `useI18n(ns)` (keeps `<T>` in every app) | 139 |
| post-flush watcher activating the namespace                           | 35  |
| tag handlers from slots (`<template #link="{ children }">`)           | 30  |
| `onServerPrefetch` (a server render waits for the namespaces)         | 25  |
| `locale` as a `WritableComputedRef` (set switches)                    | 25  |
| `isLoading` computed                                                  | 25  |
| `$t` on `globalProperties`                                            | 22  |
| text-joined children (a slot renders `{{ children }}`)                | 18  |
| `.catch` of a failed switch from the `locale` setter                  | 5   |
| `dir` computed                                                        | 5   |

Taken, in order (each measured on the same core): the cell on the instance under the injection
symbol, `<T>` with `i18nKey` as its one prop (619); the install closure and a `/* @__PURE__ */`
`<T>` (606); the bound `<T>` a functional component (its namespace is `useI18n(ns)`'s), the
exported `<T>` its own module and chunk with its own watcher (an app that does not import it
carries none of it, its `watchEffect` import included), activation in `onMounted`, and no
`onServerPrefetch` — a server render activates nothing, as React's does; the request loads its
route's namespaces before `renderToString` (550 → 540); the bound `<T>` with no declared props
(518); rich output and joined children as the list of parts instead of a Fragment node, so
`h`/`Fragment` leave the binding (492). Kept: everything else above. Result, one sweep after
`TURBO_FORCE=true pnpm build`:

| row                   | gzip B | budget | ceiling | note                                               |
| --------------------- | ------ | ------ | ------- | -------------------------------------------------- |
| vue-icu-cdn           | 5,382  | 5,395  | 5,395   | **+492 B** over core-icu-cdn (cap 500)             |
| fw-vue-default        | 4,881  | 5,126  | —       | 0.7: 7,709                                         |
| fw-vue-full-composite | 7,452  | 7,825  | —       | 0.7: 13,567; every export + cdn, plugins, devtools |

`fw-vue-full-composite` was re-baselined from the lot's final sweep (7,448 → 7,452: the exported
`<T>`'s setup became a named function for Stryker). It now names its entries (`@comvi/vue`, `/format` and the core subpaths it
imports), like `fw-react-full-composite`.

### Lot 4 review fix pass (2026-10-28)

`vue-icu-cdn` stays at **5,382 B, +492 B** over `core-icu-cdn` (4,890). Added in the binding:
attribute names camelized (`camelize` from `vue`, external) into a prototype-free params object,
the bound `<T>`'s namespace set last, the bound `<T>` table moved from a module object into the
instance's cell. Paid for by: the bound `<T>` closing over its instance (no `use()` per render),
the key read from the camelized params (no `p["i18n-key"]` fallback, no `props` on the exported
`<T>`), and `N()` re-exported from `@comvi/core/internal` instead of two `Object.create(null)`.
The first cut, which froze the server clock in the binding's `createI18n`, measured 5,415 B
(+525, over the cap): the clock moved to the core's `/format` and `/internal` (`clock.ts`, a
shared chunk), 0 B in `core-icu-cdn` and the binding rows. One sweep after
`TURBO_FORCE=true pnpm build`, Node v24.22.1:

| row                     | gzip B | budget | was   | why                                                    |
| ----------------------- | ------ | ------ | ----- | ------------------------------------------------------ |
| vue-icu-cdn             | 5,382  | 5,395  | 5,382 | +492 B over core-icu-cdn (cap 500)                     |
| fw-vue-default          | 4,882  | 5,127  | 4,881 | re-baselined (× 1.05)                                  |
| fw-vue-full-composite   | 7,508  | 7,884  | 7,452 | re-baselined: the core clock chunk, `<T>` camelizes    |
| react-icu-cdn           | 5,360  | 5,395  | 5,359 | +470 B (core's `/internal` exports `N`)                |
| fw-react-full-composite | 7,791  | 8,135  | 7,747 | the core clock chunk under `/format`; not re-baselined |

Seen red: 60 random bytes in `install()` → `x vue-icu-cdn: 5473 B vs budget 5395 B … +583 B over
core-icu-cdn vs cap +500 B`, `Size gate failed for: vue-icu-cdn`; reverted.

### Lot 4 final pass (2026-10-28)

`vue-icu-cdn` **5,380 B, +490 B** over `core-icu-cdn` (4,890). `render()` fills the params from
the slots first and the attributes over them (an attribute bound to `null`/`undefined` wins,
Codex N-2): 8 B less than the `??=` form, which measured 5,388 B (+498) with the `$t` zone check.
That check is development-only: the production `$t` is `tr(i)` as before. Core is unchanged: the
fix for Codex N-1 (a failed slot handed over as `null`, retried by an explicit `load(ns)`)
measured `core-icu-cdn` 4,903–4,907 B against the 4,895 B ceiling and was reverted (handover
notes). One sweep after `TURBO_FORCE=true pnpm build`, Node v24.22.1:

| row                   | gzip B | budget | was   | why                                |
| --------------------- | ------ | ------ | ----- | ---------------------------------- |
| vue-icu-cdn           | 5,380  | 5,395  | 5,382 | +490 B over core-icu-cdn (cap 500) |
| fw-vue-default        | 4,880  | 5,124  | 4,882 | re-baselined (× 1.05)              |
| fw-vue-full-composite | 7,505  | 7,881  | 7,508 | re-baselined (× 1.05)              |

## 2026-10-28: lot 4 N-1 fix — the owner raises the `core-icu-cdn` ceiling to 4,910 B

Codex N-1 (F-M2): `handover()` handed a slot that failed to load on the server over as `{}`, so an
explicit `load(ns)` in the browser never asked for it again. Now it is handed over as `null`, and
`createI18n({ catalogs })` puts a `null` slot in the negative cache and its namespace in the active
set: hydration asks for nothing (R3-21), `load(ns)` retries it. The owner (28.10.2026) raised the
R3-13 `core-icu-cdn` ceiling **4,895 → 4,910 B** for this fix; the binding rows whose ceiling is
`core-icu-cdn`'s + 500 follow: `react-icu-cdn` and `vue-icu-cdn` **5,395 → 5,410 B**. The +500 B
cap on each binding's increment is unchanged; no other ceiling or budget moved.

Cheapest form kept: `for…in` over the catalogs and `else bad.set(key, act.add(n))` (one call,
the cached value never read) — +9 B gz on source against +12 B with a separate `act.add(n)` and
+13 B with `Object.keys`. The first form on dist was red against the old ceiling:
`x core-icu-cdn: 4.79 KB (4903 B) min+gz vs budget 4.78 KB (4895 B)`, `Size gate failed for:
core-icu-cdn`. One sweep after `TURBO_FORCE=true pnpm build`, Node v24.22.1:

| row                     | gzip B | was   | Δ   | budget | ceiling | why                                |
| ----------------------- | ------ | ----- | --- | ------ | ------- | ---------------------------------- |
| core-icu-cdn            | 4,900  | 4,890 | +10 | 4,910  | 4,910   | the fix; 10 B headroom             |
| react-icu-cdn           | 5,371  | 5,360 | +11 | 5,410  | 5,410   | +471 B over core-icu-cdn (cap 500) |
| vue-icu-cdn             | 5,390  | 5,380 | +10 | 5,410  | 5,410   | +490 B over core-icu-cdn (cap 500) |
| core-icu                | 4,432  | 4,423 | +9  | 4,449  | 4,449   | the same core; 17 B headroom       |
| core-locale             | 588    | 587   | +1  | 618    | —       | shared-chunk gzip noise            |
| core-icu-cdn-store      | 5,062  | 5,055 | +7  | 5,308  | —       | the same core                      |
| core-icu-api            | 5,421  | 5,413 | +8  | 5,684  | —       | the same core                      |
| core-icu-devtools       | 4,875  | 4,866 | +9  | 5,017  | 5,017   | the same core                      |
| core-format             | 5,034  | 5,023 | +11 | 5,222  | —       | the same core                      |
| core-plugins            | 5,013  | 5,003 | +10 | 5,254  | —       | the same core                      |
| fw-react-default        | 4,871  | 4,860 | +11 | 5,101  | —       | the same core                      |
| fw-react-full-composite | 7,805  | 7,791 | +14 | 8,135  | —       | the same core                      |
| fw-vue-default          | 4,889  | 4,880 | +9  | 5,124  | —       | the same core                      |
| fw-vue-full-composite   | 7,516  | 7,505 | +11 | 7,881  | —       | the same core                      |

Baselines moved for the three rows named by the owner's decision (`core-icu-cdn`,
`react-icu-cdn`, `vue-icu-cdn`); the others stay at their last re-baseline, all within budget.

## 2026-10-29: lot 4b — DX contracts on core, React and Vue (R3-25)

The owner (29.10.2026, R3-25) raised three ceilings for lot 4b: `core-icu-cdn` **4,910 →
4,960 B**; `react-icu-cdn` **5,410 → 5,470 B** with the React increment over `core-icu-cdn`
still capped at **+500 B**; `vue-icu-cdn` **5,410 → 5,560 B** with the Vue increment cap raised
**+500 → +600 B** (`increment.maxBytes` of the row). No other ceiling moved: `core-icu` stays at
4,449 B (R3-13), which held the core's share of the lot to +13 B. Budgets of the three rows =
`ceil(measured × 1.05)` capped at the ceiling = the ceiling. One sweep after `TURBO_FORCE=true`
builds of the finished graphs, `node --version` v24.22.1; "was" = `origin/next` @ 8881e561
measured the same way at the start of the lot:

| row                     | gzip B | was   | Δ    | budget | ceiling | why                                         |
| ----------------------- | ------ | ----- | ---- | ------ | ------- | ------------------------------------------- |
| core-icu-cdn            | 4,921  | 4,900 | +21  | 4,960  | 4,960   | the core below; 39 B headroom               |
| react-icu-cdn           | 5,420  | 5,371 | +49  | 5,470  | 5,470   | +499 B over core-icu-cdn (cap 500)          |
| vue-icu-cdn             | 5,494  | 5,390 | +104 | 5,560  | 5,560   | +573 B over core-icu-cdn (cap 600)          |
| core-icu                | 4,445  | 4,432 | +13  | 4,449  | 4,449   | load()/setLocale() rules; 4 B headroom      |
| core-locale             | 587    | 588   | −1   | 617    | —       | shared-chunk gzip noise                     |
| core-icu-cdn-store      | 5,090  | 5,062 | +28  | 5,345  | —       | the same core                               |
| core-icu-api            | 5,443  | 5,421 | +22  | 5,716  | —       | the same core                               |
| core-icu-devtools       | 4,890  | 4,875 | +15  | 5,017  | 5,017   | the same core (+445 over core-icu, cap 500) |
| core-format             | 5,098  | 5,034 | +64  | 5,353  | —       | `serverNow`/`live()` clock, relative opts   |
| core-plugins            | 5,020  | 5,013 | +7   | 5,271  | —       | the same core                               |
| fw-react-default        | 4,912  | 4,871 | +41  | 5,158  | —       | the React binding                           |
| fw-react-full-composite | 7,938  | 7,805 | +133 | 8,335  | —       | + `useFormat` mount mark, relative opts     |
| fw-vue-default          | 4,978  | 4,889 | +89  | 5,227  | —       | the Vue binding                             |
| fw-vue-full-composite   | 7,707  | 7,516 | +191 | 8,093  | —       | + `useFormat` mount mark, relative opts     |

The other rows' baselines moved with the core and the bindings; their budgets follow the rule
`ceil(baseline × 1.05)` (no ceiling on them), as `scripts/docs-snippets/run.test.mjs` checks.

Itemized (gzip deltas measured one change at a time on the row named; they do not add up
exactly — gzip is not additive):

- **core (`core-icu`, +13 B)**: `setLocale()` snapshots the active set (−5 B, the old re-check
  over `act` was longer), loads late namespaces after the switch (`ensure(l, act)`), `load()`
  rejects by the own-chain rule shared with `setLocale()` (`lost()`, +35…41 B in four tried
  forms); paid for by the production `RangeError` of an invalid `setLocale()` tag carrying the
  tag only (the message stays in development; `invalid_locale` is reported either way), −23 B.
  Variants tried and dropped: the promise executor form of `setLocale` (+5 B, gzip), rest
  arguments in `translate()` (0 B).
- **React (increment +471 → +499 B)**: `useI18n()` activates `default` (−3 B), the first-paint
  mark at commit (`useEffect`, +6 B), a direct `<I18nHandover>` child passes the gate (the
  handover registers itself in the `painted` WeakSet, +6 B; a `type.h` marker was +9 B),
  `<T components>` (+38 B; the element form `<a href />` via `cloneElement` was +29 B more and
  is not in the lot). Golf to stay under +500 B, all without behaviour change: `N()` for the
  bound-`<T>` table, `useContext` inlined in `useI18n`, the bound `<T>` cached for `default` too,
  `loading: spinner = children` (−4 B), member order of the `useI18n()` object (−3 B).
- **Vue (increment +490 → +573 B)**: `locale` as a `customRef` over the `computed` slice, so a
  failed switch re-renders its readers (+26 B; the `i.on`-subscribed form was +32 B),
  `useI18n()` activates `default` (−2 B), `onServerPrefetch` (+17 B), `undefined` attributes
  leave the tag to the next source (+1 B), `<T components>` with the content as default slot
  (+30 B), `onServerPrefetch` registered only while the namespace is still coming (+5 B: the
  hook made every component render async in `renderToString`, +8…17 % in `perf-vue.mjs`). `inheritAttrs: false` on the bound `<T>`: not added — with no declared props every
  attribute is a prop and none falls through (test `rich-4b.test.ts`), so the flag changes
  nothing in Vue 3.5 (seen: removing it from the exported `<T>` too keeps the test green).
- **Stopped (does not fit +600 B, owner decision needed)**: the Vue slot `children` ALWAYS as
  the message's text (the brief's "slot gets a string built from the message before nested
  handlers run"). Measured on the finished graph: +67 B (a per-render map from handler output
  to the message text) and +85 B (a second render pass collecting every tag's text), i.e.
  +640…658 B over `core-icu-cdn`, 40…58 B over the cap. Every other Vue item together is
  +83 B; even with `components` AND server prefetch dropped, slot text (map form) measured
  5,525 B = +604 B, still 4 B over. Shipped instead: text-only slot content
  stays a string (the README case), a slot whose tag holds markup gets the parts, and
  development warns once to use `components` (0 B in production). Also not in the lot, for
  bytes: `{ component, props }` in Vue `components` (+17 B) — a component that sets the props,
  or a handler attribute, covers it.

## 2026-10-29: lot 4b fix pass (Fable review, Codex review, gate report on 6adc82c4)

Within the R3-25 ceilings; no ceiling or increment cap moved. One sweep after `TURBO_FORCE=true`
builds of the finished graphs, `node --version` v24.22.1; "was" = 6adc82c4 (the rows of the
section above). Budgets = `ceil(measured × 1.05)`, capped at the ceiling where the row has one.

| row                     | gzip B | was   | Δ   | budget | ceiling | why                                                              |
| ----------------------- | ------ | ----- | --- | ------ | ------- | ---------------------------------------------------------------- |
| core-compile            | 1,865  | 1,857 | +8  | 1,959  | 2,000   | the text pass of a tag (handler 2nd argument), loose equality    |
| core-locale             | 584    | 587   | −3  | 614    | —       | loose equality in `locale.ts`                                    |
| core-negotiate          | 497    | 498   | −1  | 522    | —       | the same                                                         |
| core-icu                | 4,447  | 4,445 | +2  | 4,449  | 4,449   | +17 B text pass, −10 B golf (see below); 2 B headroom            |
| core-icu-cdn            | 4,926  | 4,921 | +5  | 4,960  | 4,960   | the core above; 34 B headroom                                    |
| core-icu-cdn-store      | 5,093  | 5,090 | +3  | 5,348  | —       | the same core                                                    |
| core-icu-api            | 5,444  | 5,443 | +1  | 5,717  | —       | the same core                                                    |
| core-icu-devtools       | 4,891  | 4,890 | +1  | 5,017  | 5,017   | the same core; `setup(i18n, mark)` (+444 over core-icu, cap 500) |
| core-format             | 5,092  | 5,098 | −6  | 5,347  | —       | `clock(i18n, live)` replaces the `LIVE` set; `now` destructured  |
| core-plugins            | 5,021  | 5,020 | +1  | 5,273  | —       | the same core                                                    |
| react-icu-cdn           | 5,425  | 5,420 | +5  | 5,470  | 5,470   | +499 B over core-icu-cdn (cap 500)                               |
| fw-react-default        | 4,909  | 4,912 | −3  | 5,155  | —       | the React binding                                                |
| fw-react-full-composite | 7,954  | 7,938 | +16 | 8,352  | —       | + `useFormat` hydration-aware clock                              |
| vue-icu-cdn             | 5,520  | 5,494 | +26 | 5,560  | 5,560   | +594 B over core-icu-cdn (cap 600)                               |
| fw-vue-default          | 5,008  | 4,978 | +30 | 5,259  | —       | the Vue binding                                                  |
| fw-vue-full-composite   | 7,793  | 7,707 | +86 | 8,183  | —       | + `useFormat` hydration-aware clock                              |

Itemized (one change at a time on the row named; gzip is not additive):

- **Vue slot `children` always text (the STOP above, resolved)**: the core renders a tag's
  content a second time on demand, in a text mode where no handler runs, and hands it to every
  handler as a second argument (`(children, text) => …`) — +17 B on `core-icu`, +20 B on
  `core-icu-cdn`, which the Vue increment does not pay. Paid for in the core: loose equality
  where both sides are always strings or numbers (scanner, ICU reader, locale helpers, the
  compile cache; −9 B on `core-icu`) and a tag's parts as `[].concat(children || [])` (−6 B).
  The Vue slot keeps only the strings of that text (a node param has none): +12 B increment.
- **The binding seam**: `@comvi/core/internal` exports `core(i18n)` and both bindings read
  `s`, `a`, `w`, `tr` off it instead of four wrapper functions (React −28 B, Vue −33 B
  increment). The editor's marking setter left the seam for `Plugin.setup(i18n, mark)` (0 B),
  so no `/internal` export can mark (the marking test pins the seam's members).
- **React (+471 → +499 B, cap 500)**: the first-paint gate waits only while a flight's
  namespace has no catalog at all (+3 B), never on a server or in a hydration (the provider's
  server snapshot marks it, +4 B; a separate `useSyncExternalStore` was +38 B, a `typeof
document` guard +11 B); the direct-`<I18nHandover>` exception and its `painted` registration
  are gone (−8 B); an `undefined` `components` entry is skipped (+3 B); `{ component, props }`
  entries (R3-24, +13 B; a component has no `props` of its own, so no `component` check);
  the joiner tests `r.map` instead of `Array.isArray` (−3 B).
- **Vue (+573 → +594 B, cap 600)**: slot text (+12 B, above); `{ component, props }` entries
  (R3-24, +16 B; a component object's own `props` option is not read); an `undefined` entry
  skipped (+3 B); server activation of an inline namespace, so `handover()` carries it, with
  the server render told by its SSR context (`inject(ssrContextKey)`, +7 B; `typeof document`
  was cheaper but wrong under a DOM, as in tests); `$t` assigned without a local (−4 B); the
  outside-`setup()` guard and the `$t` idle-namespace warning are development-only (0 B).
- Declined for bytes: none. The React element form (`components={ link: <a href /> }`)
  is not in the lot: `{ component, props }` (R3-24) covers it, and `cloneElement` was +29 B.

## 2026-10-29: lot 4b fix pass 2 (Codex re-check of abff1418)

Within the R3-25 ceilings; no ceiling or increment cap moved. One sweep after `TURBO_FORCE=true`
builds of the finished graphs, `node --version` v24.22.1; "was" = abff1418 (the rows of the
section above). Budgets = `ceil(measured × 1.05)`, capped at the ceiling where the row has one.

| row                     | gzip B | was   | Δ   | budget | ceiling | why                                                      |
| ----------------------- | ------ | ----- | --- | ------ | ------- | -------------------------------------------------------- |
| core-compile            | 1,861  | 1,865 | −4  | 1,955  | 2,000   | text pass only for a 2-parameter handler; no `EMPTY`     |
| core-locale             | 583    | 584   | −1  | 613    | —       | `canonicalize` falls through its `catch`                 |
| core-negotiate          | 496    | 497   | −1  | 521    | —       | the same                                                 |
| core-icu                | 4,443  | 4,447 | −4  | 4,449  | 4,449   | see below; 6 B headroom                                  |
| core-icu-cdn            | 4,925  | 4,926 | −1  | 4,960  | 4,960   | the core above; 35 B headroom                            |
| core-icu-cdn-store      | 5,091  | 5,093 | −2  | 5,346  | —       | the same core                                            |
| core-icu-api            | 5,440  | 5,444 | −4  | 5,712  | —       | the same core                                            |
| core-icu-devtools       | 4,891  | 4,891 | 0   | 5,017  | 5,017   | +448 over core-icu (cap 500): the setter moved to `MS`   |
| core-devtools           | 628    | 625   | +3  | 644    | 644     | `devtools()` reads the setter from `MS`                  |
| core-format             | 5,088  | 5,092 | −4  | 5,343  | —       | the same core                                            |
| core-plugins            | 5,020  | 5,021 | −1  | 5,271  | —       | the same core                                            |
| react-icu-cdn           | 5,425  | 5,425 | 0   | 5,470  | 5,470   | +500 B over core-icu-cdn (cap 500); React unchanged      |
| fw-react-default        | 4,908  | 4,909 | −1  | 5,154  | —       | the core                                                 |
| fw-react-full-composite | 7,955  | 7,954 | +1  | 8,353  | —       | the core                                                 |
| vue-icu-cdn             | 5,516  | 5,520 | −4  | 5,560  | 5,560   | +591 B over core-icu-cdn (cap 600): slot text as a value |
| fw-vue-default          | 5,002  | 5,008 | −6  | 5,253  | —       | the same                                                 |
| fw-vue-full-composite   | 7,794  | 7,793 | +1  | 8,184  | —       | the same                                                 |

Itemized (one change at a time on `core-icu`; gzip is not additive):

- **Slot text before the nested handlers (Codex re-check HIGH 2)**: a handler that declares a
  second parameter gets the text, rendered BEFORE the children; a one-parameter handler gets
  no text pass (no closure per call either). +6 B in the first form, +3 B in the shipped one
  (the text pass inside the function branch).
- **The marking setter out of `Plugin.setup` (HIGH 3)**: `createI18n` puts it in the module
  variable `MS`, which only `devtools()` reads during its setup (+7 B; keying it in the `CORE`
  map by `CORE` itself was +8 B, a setter beside `pub` +9 B).
- Paid for, without behaviour change: `arg()` reads no param from `undefined`, so a render
  without params needs no shared empty object (`EMPTY` and `p || EMPTY` gone, −8 B; a plain
  `{}` instead of the frozen one was −3 B); `pr` written as `m || s?.p ? undefined : s?.c`
  (−1 B); `canonicalize` returns `undefined` by falling through its `catch` (−1 B);
  `destroy()` no longer resets `ready`'s promise, which `fl.size` already bypasses (−1 B).
  Tried and dropped (0 B or worse): arrow `on` / `load`, `pub(void (mf = f))`.
- **Stopped (does not fit +500 B, owner decision needed): React client-side handover under a
  shut `loading` gate (HIGH 1, Fable 6, Codex 7).** The provider decides the gate before the
  children render, so on a client render (no server HTML) a handover among them cannot bring
  its catalogs first. Measured on the finished graph against React at +500/500 B:
  - the children mounted hidden beside `loading` (`<div hidden>`, only when `loading` is
    given) so a handover at any depth commits: +17 B (with `core(i).s` as the getter, −8 B)
    → +517 B;
  - the gate decided at commit (children render first, a layout effect shuts the gate before
    the paint when a namespace still has no text; works for `suspense` too): +59 B → +559 B;
  - the hidden mount installed by the handover module (0 B for apps without a handover, +8 B
    hook on the provider): rejected — the module's side effect then depends on tree-shaking,
    so development (no shaking) and production would behave differently.
    Shipped instead: unchanged (hydration at any depth passes the gate; a client render waits
    like any child, as `loading-4b.test.tsx` pins).

## 2026-10-29: lot 4b fix pass 3 (owner decisions on HIGH 1)

Owner decisions (29.10.2026): the hidden mount (children in `<b hidden>` beside `loading`,
+520 B, 4d80bc9d) is rejected and reverted (1fd738df); correctness and DX outrank the size
budget; a handover at arbitrary depth under the gate is no longer required (the contract is
data → gate → content); the budget comes from the simplest correct implementation with the
repo's headroom, `ceil(measured × 1.05)`, and the `react-icu-cdn` ceiling and the React
increment cap follow from it. The commit-time gate (a server-guarded layout effect, 5,487 B,
+62 B) failed the owner's lifecycle conditions (`.lot1-pending-tests.md`, fix pass 3: a DOM
copy of the children, a second mount, effects before the gate opens) and is not shipped. The
simplest correct implementation is the binding as it was: no binding code changed (JSDoc
only). One sweep after `TURBO_FORCE=true` builds, `node --version` v24.22.1.

| row                     | gzip B | was   | budget | ceiling | increment cap                 |
| ----------------------- | ------ | ----- | ------ | ------- | ----------------------------- |
| react-icu-cdn           | 5,425  | 5,425 | 5,697  | 5,697   | +525 (measured +500), was 500 |
| fw-react-default        | 4,908  | 4,908 | 5,154  | —       | —                             |
| fw-react-full-composite | 7,955  | 7,955 | 8,353  | —       | —                             |

`react-icu-cdn`: budget = ceiling = ceil(5,425 × 1.05) = 5,697 B (was 5,470); increment cap =
ceil(500 × 1.05) = +525 B over `core-icu-cdn` (was +500; the owner's earlier +520 is
superseded). `core-icu-cdn` (4,925 / 4,960), Vue (+600) and `core-icu-devtools` (+500)
unchanged.

## 2026-10-29: lot 4b Codex re-check fix (HIGH A marking setter, HIGH B messages + catalogs)

Codex's final re-check of 5fa808f5 (two HIGH). One sweep after `TURBO_FORCE=true` builds,
`node --version` v24.22.1; "was" = fix pass 3. Budgets = `ceil(measured × 1.05)`, capped at the
ceiling where the row has one; `react-icu-cdn`'s budget, ceiling and increment cap follow the
owner's rule of fix pass 3 (ceiling = budget = ceil(measured × 1.05), cap = ceil(increment ×
1.05)). No owner ceiling moved: `core-icu` 4,449 and `core-icu-cdn` 4,960 hold.

| row                     | gzip B | was   | Δ   | budget | ceiling | note                             |
| ----------------------- | ------ | ----- | --- | ------ | ------- | -------------------------------- |
| core-icu                | 4,445  | 4,443 | +2  | 4,449  | 4,449   | 4 B headroom                     |
| core-icu-cdn            | 4,927  | 4,925 | +2  | 4,960  | 4,960   | 33 B headroom                    |
| core-icu-cdn-store      | 5,093  | 5,091 | +2  | 5,348  | —       |                                  |
| core-icu-api            | 5,439  | 5,440 | −1  | 5,711  | —       |                                  |
| core-icu-devtools       | 4,895  | 4,891 | +4  | 5,017  | 5,017   | +450 over core-icu (cap 500)     |
| core-devtools           | 631    | 628   | +3  | 644    | 644     | `MS.get(i18n)`                   |
| core-format             | 5,091  | 5,088 | +3  | 5,346  | —       |                                  |
| react-icu-cdn           | 5,428  | 5,425 | +3  | 5,700  | 5,700   | +501 over core-icu-cdn, cap +527 |
| fw-react-default        | 4,912  | 4,908 | +4  | 5,158  | —       |                                  |
| fw-react-full-composite | 7,956  | 7,955 | +1  | 8,354  | —       |                                  |
| vue-icu-cdn             | 5,520  | 5,516 | +4  | 5,560  | 5,560   | +593 over core-icu-cdn (cap 600) |
| fw-vue-default          | 5,006  | 5,002 | +4  | 5,257  | —       |                                  |
| fw-vue-full-composite   | 7,796  | 7,794 | +2  | 8,186  | —       |                                  |

Itemized on `core-icu` (one change at a time; gzip is not additive): the marking setter in a
private `WeakMap` keyed by the instance (`MS`, not exported by `/internal`) instead of a module
variable: +4 B; `messages` merged per locale under `catalogs` (`N(o.messages, cats[D])`) inside
`if (o.messages)`: +4 B; both: +7 B (4,450, over the 4,449 ceiling). Shipped: the merge without
the `if` (with neither option `default` is an empty record, which the ingest loop skips): +2 B
in all. Tried and dropped: the setter keyed by the instance's `Core` record in the `CORE` map
(no gain on `core-icu`, +2 B on `core-icu-cdn`).

## 2026-10-29: lot 4c — namespace holds, `isReady`, `<T>` reads only (R3-26)

The owner's brief `lot4c-brief-owner-2026-10-29.md` (R3-26): per-instance consumer counts and the
active set, `isReady` / `isLoading` as core predicates, `useI18n(ns)` holding its namespace (React
effect with cleanup; Vue mount/unmount and `KeepAlive`), `<T>` and `$t` read only, the React gate on
`isReady` (the owner's review of e5a3788d, HIGH), a rejected switch reloading what its start
aborted, the dev-only idle-read diagnostic (0 B in production: its strings are absent from the
production dists, and the declared-read flag is the development-only seam `Core.d`). Measured on
the finished implementation; one sweep after `TURBO_FORCE=true pnpm build`, `node --version`
v24.22.1. Per the lot's rule (correctness first, no ceiling raised by the executor) **four rows
fail and are left failing for the owner**:

| row           | gzip B | was (4b) | Δ    | budget | ceiling | increment over core-icu-cdn |
| ------------- | ------ | -------- | ---- | ------ | ------- | --------------------------- |
| core-icu      | 4,507  | 4,445    | +62  | 4,449  | 4,449   | —                           |
| core-icu-cdn  | 4,995  | 4,927    | +68  | 4,960  | 4,960   | —                           |
| react-icu-cdn | 5,529  | 5,428    | +101 | 5,700  | 5,700   | +534, cap +527              |
| vue-icu-cdn   | 5,669  | 5,520    | +149 | 5,560  | 5,560   | +674, cap +600              |

Itemized (a relative probe from `src`, esbuild minify + gzip -9, one piece removed at a time;
gzip is not additive): core — the `isReady` predicate and its seam +13…15 B, the reloading of a
rejected switch +4…5 B, the rest (hold counts with the pin of `namespaces`, the active set as
`Object.keys(counts)`, `load()` without a pin, the first-need publish, `handover()` over every
needed namespace with failed pairs from the negative cache, the `isLoading` rule over the chain
and the negative cache) ≈ +45 B; `view()` lost its invented loading entries (−, `/internal`).
React — `isReady` +9 B, the hold's cleanup and `<T>` reading through the context instead of
`useI18n()` ≈ +20 B, the gate on the core's `isReady` 0 B (gate sweep). Vue — `isReady` +10 B,
`KeepAlive` (`onActivated`/`onDeactivated`) +22 B, the release machinery in all (the hold's
release, `onUnmounted`, the two closures, `KeepAlive`) +43 B. Tried and dropped (no gain on the
gate): the hold as one arrow expression, the `isLoading` rule as `!(a || b)`, the active set as
`> 0`; a Vue `tr` with `core(i)` as a default parameter (+5 B).

Rows that fit, re-baselined from the same sweep (budget = ceil(measured × 1.05), never above a
ceiling):

| row                     | gzip B | was   | budget | ceiling |
| ----------------------- | ------ | ----- | ------ | ------- |
| core-compile            | 1,862  | 1,861 | 1,956  | 2,000   |
| core-locale             | 584    | 583   | 614    | —       |
| core-icu-cdn-store      | 5,160  | 5,093 | 5,418  | —       |
| core-icu-api            | 5,513  | 5,439 | 5,789  | —       |
| core-icu-devtools       | 4,964  | 4,895 | 5,017  | 5,017   |
| core-devtools           | 639    | 631   | 644    | 644     |
| core-format             | 5,167  | 5,091 | 5,426  | —       |
| core-plugins            | 5,089  | 5,020 | 5,344  | —       |
| fw-react-default        | 5,014  | 4,912 | 5,265  | —       |
| fw-react-full-composite | 8,008  | 7,956 | 8,409  | —       |
| fw-vue-default          | 5,151  | 5,006 | 5,409  | —       |
| fw-vue-full-composite   | 7,866  | 7,796 | 8,260  | —       |

`fw-vue-default` (+145 B) and `fw-react-default` (+102 B) carry the core's and the binding's
growth together (no loader in their graphs, so no `cdn()` to dilute it). `core-icu-devtools` is
+457 B over `core-icu` (cap +500).

## 2026-10-30: lot 4c fix pass (Fable review, Codex review, gate report on 1f58ee08)

Fixes of the reviews of 1f58ee08 (R3-26): a consumer counted before its hold publishes (a
subscriber switching in that publish waited for nothing), an idempotent release, `handover()`
over every namespace with a catalog of the chain in place (inline catalogs a React server render
read without a hold were lost: the browser's `{ ...options, ...payload }` replaces `catalogs`),
Vue's `useI18n()` outside a component (no hook in any build, `isLoading` a load in flight only,
its reads not a declared need), and the development diagnostic (a declared read covers its own
namespace only; the idle check runs again after the render's task — development only, 0 B in
production: its strings stay absent from the production dists, `contracts.test.ts`). One sweep
after `TURBO_FORCE=true pnpm build`, `node --version` v24.22.1. The four rows over since lot 4c
stay over, ceilings untouched, **left failing for the owner**:

| row           | gzip B | 1f58ee08 | Δ   | budget | ceiling | increment over core-icu-cdn |
| ------------- | ------ | -------- | --- | ------ | ------- | --------------------------- |
| core-icu      | 4,532  | 4,507    | +25 | 4,449  | 4,449   | —                           |
| core-icu-cdn  | 5,018  | 4,995    | +23 | 4,960  | 4,960   | —                           |
| react-icu-cdn | 5,554  | 5,529    | +25 | 5,700  | 5,700   | +536, cap +527              |
| vue-icu-cdn   | 5,718  | 5,669    | +49 | 5,560  | 5,560   | +700, cap +600              |

Itemized (one piece reverted at a time on the finished build; gzip is not additive): the
release's once-guard +8…9 B; the hold counted before `ensure()` publishes +4…5 B; `handover()`
over `N(state.c, counts)` 0 B on these rows (`/internal`, a server path); Vue's flight-only
`isLoading` outside a component through the core's predicate (`w(state, ns, flightsOnly)`) +6 B
on vue-icu-cdn (an earlier Vue-side `ld.some()` arm cost +19 B and was dropped); the rest of
Vue's +26 B over the core's growth is `getCurrentInstance()` kept in production (hooks were
registered outside a component there) and the bound `<T>` passing its namespace as the call's.
The React binding's source changed in JSDoc only: its +25 B is the core's.

Rows that fit, re-baselined from the same sweep (budget = ceil(measured × 1.05), never above a
ceiling):

| row                     | gzip B | was   | budget | ceiling |
| ----------------------- | ------ | ----- | ------ | ------- |
| core-icu-cdn-store      | 5,185  | 5,160 | 5,445  | —       |
| core-icu-api            | 5,536  | 5,513 | 5,813  | —       |
| core-icu-devtools       | 4,985  | 4,964 | 5,017  | 5,017   |
| core-format             | 5,187  | 5,167 | 5,447  | —       |
| core-plugins            | 5,113  | 5,089 | 5,369  | —       |
| fw-react-default        | 5,034  | 5,014 | 5,286  | —       |
| fw-react-full-composite | 8,033  | 8,008 | 8,435  | —       |
| fw-vue-default          | 5,202  | 5,151 | 5,463  | —       |
| fw-vue-full-composite   | 7,907  | 7,866 | 8,303  | —       |

`core-compile` (1,862), `core-locale` (584), `core-negotiate` (496) and `core-devtools` (639) did
not move. `core-icu-devtools` is +453 B over `core-icu` (cap +500).

## 2026-10-30: lot 4c — owner accepts the growth (×1.02 ceilings)

Owner decision, 30.10.2026: the growth of lot 4c's functionality is accepted, the affected budgets
are updated by the ×1.02 rule rounded up, the clarification is stated in this documentation, and
no further optimisation is done for a few bytes. No code changed. One sweep after
`TURBO_FORCE=true pnpm build`, `node --version` v24.22.1; the other rows (`core-compile` 1,862,
`core-locale` 584, `core-negotiate` 496, `core-icu-cdn-store`, `core-icu-api`,
`core-icu-devtools`, `core-devtools`, `core-format`, `core-plugins`, the fw rows) measured
unchanged from the lot 4c fix pass and keep their baselines, budgets and ceilings.

| row                       | measured | old ceiling / cap | new ceiling / cap | budget |
| ------------------------- | -------- | ----------------- | ----------------- | ------ |
| core-icu                  | 4,532    | 4,449             | 4,623             | 4,623  |
| core-icu-cdn              | 5,018    | 4,960             | 5,119             | 5,119  |
| react-icu-cdn (row)       | 5,554    | 5,700             | 5,666             | 5,666  |
| react-icu-cdn (increment) | +536     | +527              | +547              | —      |
| vue-icu-cdn (row)         | 5,718    | 5,560             | 5,833             | 5,833  |
| vue-icu-cdn (increment)   | +700     | +600              | +714              | —      |

`react-icu-cdn`'s row was already under its 5,700 B ceiling (5,554, a lot 4b ×1.05 ceiling);
only its increment cap was over. On the owner's follow-up (2026-10-30) the row ceiling was
lowered to ceil(5,554 × 1.02) = 5,666 B as well, so every ceiling changed in lot 4c follows the
×1.02 rule (112 B headroom). Minified sizes: core-icu 9,202, core-icu-cdn 10,293,
react-icu-cdn 11,391, vue-icu-cdn 11,730.

**POLICY CLARIFICATION.** When the owner accepts growth for functionality, the affected ceiling
(and binding increment cap) is set to `ceil(measured × 1.02)`. Budgets keep the existing rule
`min(ceiling, ceil(measured × 1.05))`. No byte golfing is done to fit; ceilings are raised only by
the owner.

## 2026-10-30: lot 4c — released consumer (Vue) and missing_key; owner-approved ceilings

Two contract fixes (owner, 30.10): a Vue `useI18n(ns)` whose component released `ns` (unmount,
`KeepAlive` deactivation) no longer reads `isLoading` true with no load coming (the need is
restored in `onActivated` only: an update of the detached subtree holds nothing); and one
`missing_key` rule
for every read — a catalog of the namespace in place for the read's chain and every pair of
that chain settled (in place or failed, no load of it in flight; without a loader the catalogs
in place are complete), no catalog of the chain a development warning only (also without a
loader). The development-only `Core.d` seam is gone; `Core.tr` takes no declaration.

Owner decision (30.10, ×1.02 policy): `core-icu-devtools` ceiling 5,017 → **5,132 B**, the
`vue-icu-cdn` increment cap +714 → **+753 B**; both rows re-baselined, budgets
`min(ceiling, ceil(measured × 1.05))`. The other rows keep their baselines, budgets and
ceilings. One sweep after `TURBO_FORCE=true pnpm build`, `node --version` v24.22.1; `pnpm size`
green.

| row                      | measured      | previous baseline | Δ         | budget / ceiling / cap  | gate |
| ------------------------ | ------------- | ----------------- | --------- | ----------------------- | ---- |
| core-icu                 | 4,574         | 4,532             | +42       | 4,623 / 4,623           | ok   |
| core-icu-cdn             | 5,058         | 5,018             | +40       | 5,119 / 5,119           | ok   |
| core-icu-devtools        | 5,031         | 4,985             | +46       | **5,132 / 5,132** (new) | ok   |
| react-icu-cdn            | 5,592         | 5,554             | +38       | 5,666 / 5,666           | ok   |
| react-icu-cdn (incr.)    | +534          | +536              | −2        | +547                    | ok   |
| vue-icu-cdn              | 5,761         | 5,718             | +43       | 5,833 / 5,833           | ok   |
| vue-icu-cdn (incr.)      | +703          | +700              | +3        | **+753** (new)          | ok   |
| fw-react-default         | 5,069         | 5,034             | +35       | 5,286                   | ok   |
| fw-react-full-composite  | 8,071         | 8,033             | +38       | 8,435                   | ok   |
| fw-vue-default           | 5,251         | 5,202             | +49       | 5,463                   | ok   |
| fw-vue-full-composite    | 7,954         | 7,907             | +47       | 8,303                   | ok   |
| core-icu-cdn-store / api | 5,226 / 5,582 | 5,185 / 5,536     | +41 / +46 | 5,445 / 5,813           | ok   |
| core-format / plugins    | 5,232 / 5,152 | 5,187 / 5,113     | +45 / +39 | 5,447 / 5,369           | ok   |

The Vue growth is the release fix (`vue-icu-cdn` 5,718 → 5,728 alone) and the core's; two
earlier variants that held in `onBeforeUpdate` during a KeepAlive activation (5,796 by vnode
identity, 5,800 by DOM connectivity) were dropped on the owner's call — public lifecycle hooks
only. The core growth is the settled-chain check (+39…+46). Minified: core-icu-devtools 10,263, vue-icu-cdn 11,824.
`core-compile` (1,862), `core-locale` (584), `core-negotiate` (496) and `core-devtools` (639) did
not move.

## 2026-10-31: lot 4d — owner-approved ceilings

Three correctness fixes on `next`: typed rich keys, the fallback chain of `useFormat()` and one
section guard for `setLocale()`, `load()` and holds, destroy paths included. Nearly all the growth
is that guard and the destroy rules (`.lot1-pending-tests.md`, "Lot 4d re-entrancy", which has the
cost per pass). The owner approved it on 31.10 under the ×1.02 policy above: each ceiling is
`ceil(measured × 1.02)`, each budget `min(ceiling, ceil(measured × 1.05))`. Increment caps are
unchanged and hold: `react-icu-cdn` +526 of +547, `vue-icu-cdn` +703 of +753, `core-icu-devtools`
+451 of +500.

One sweep after `TURBO_FORCE=1 pnpm build` at fccdd66e, `node --version` v24.22.1; `pnpm size`
green. The rows below were re-baselined; before is a sweep of the same `next` base under Node 24.

| row                     | 5158518b | now   | Δ    | budget | ceiling   |
| ----------------------- | -------- | ----- | ---- | ------ | --------- |
| core-icu                | 4,574    | 4,747 | +173 | 4,842  | **4,842** |
| core-icu-cdn            | 5,058    | 5,229 | +171 | 5,334  | **5,334** |
| core-icu-devtools       | 5,031    | 5,198 | +167 | 5,302  | **5,302** |
| react-icu-cdn           | 5,592    | 5,755 | +163 | 5,871  | **5,871** |
| vue-icu-cdn             | 5,759    | 5,932 | +173 | 6,051  | **6,051** |
| core-icu-cdn-store      | 5,226    | 5,396 | +170 | 5,666  | —         |
| core-icu-api            | 5,582    | 5,750 | +168 | 6,038  | —         |
| core-format             | 5,232    | 5,403 | +171 | 5,674  | —         |
| core-plugins            | 5,152    | 5,329 | +177 | 5,596  | —         |
| fw-react-default        | 5,069    | 5,243 | +174 | 5,506  | —         |
| fw-react-full-composite | 8,071    | 8,232 | +161 | 8,644  | —         |
| fw-vue-default          | 5,251    | 5,419 | +168 | 5,690  | —         |
| fw-vue-full-composite   | 7,964    | 8,134 | +170 | 8,541  | —         |

`core-compile` (1,862), `core-locale` (584), `core-negotiate` (496) and `core-devtools` (639) did
not move.
