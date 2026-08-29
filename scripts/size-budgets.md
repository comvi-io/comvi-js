# Size budgets — the rule and how to re-baseline

Companion to `scripts/size-budgets.json`, enforced by `scripts/size-check.mjs` (`pnpm size`, run in
the CI `build` job after `pnpm build`). The JSON holds numbers and one-line notes; this file holds
the rule behind them.

## What the gate measures

Each of the 15 rows bundles one fixture from `scripts/size-fixtures/` with esbuild — `bundle`,
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
`fw-next-server-default-loader`, `fw-nuxt-client-default`, `fw-nuxt-full-composite`.

Each framework pair is a floor (one specifier, base host) and a ceiling (every capability composed
through that same specifier). The pair is the measurement — adding or removing one half turns the
other from a delta into a bare number, so change them together.
