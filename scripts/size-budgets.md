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
`fw-next-server-default-loader`, `fw-next-server-provider`, `fw-next-root-composed`, `fw-next-plugin-node`, `fw-next-middleware-edge`, `fw-nuxt-client-default`,
`fw-nuxt-full-composite`, `fw-nuxt-host`; the platform
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
