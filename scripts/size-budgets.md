# Size budgets — rules, history, and how to re-baseline

Companion to `scripts/size-budgets.json`, which is enforced by `scripts/size-check.mjs`
(`pnpm size`, CI job `size`). The JSON holds numbers and one-line notes; everything that
explains _why_ a number is what it is lives here.

---

## 1. What the gate measures

Each row bundles one fixture from `scripts/size-fixtures/` with esbuild — `bundle`, `minify`,
`format: esm`, `platform: browser`, `target: es2020`, `__DEV__=false`,
`process.env.NODE_ENV="production"` — and gzips the result at level 9. The reported figure is
**min+gz bytes**.

Fixture imports resolve through each package's **published `exports` map** under the production
conditions `["production", "import", "module", "browser"]` — never through `dist/` paths and never
through the legacy `module`/`main` fields. A row therefore fails when the exports/conditions matrix
breaks for real consumers, not only when bytes grow. `assertPublishedFile` additionally rejects an
exports target that falls outside the package's `files` allowlist.

Framework peer deps (`react`, `vue`, `solid-js`, `svelte`, `next`, `nuxt`) are marked `external` per
fixture, so a framework row measures **the comvi graph only**.

## 2. The two things a row can assert

**Bytes.** A row with `gzipBudgetBytes` fails when the measured min+gz exceeds it. A row without one
is _informational on bytes_: measured, printed, never gated.

**Module-graph membership.** A row with `sentinelModules` + `expectSentinels: "absent" | "present"`
fails when the expectation does not hold. Sentinels are read from the esbuild **metafile**, from
`outputs[*].inputs` — the modules that survived into the bundle — never from the top-level
`metafile.inputs` map (which lists everything esbuild _parsed_, including modules tree-shaking
removed) and never from output-text substrings. Reading `metafile.inputs` made every sentinel a
false positive once; that is the bug this discipline exists to prevent.

A row can carry sentinels without a byte budget. `probe-react-tags-pinning` and
`plugin-editor-production-with` are exactly that: their claim _is_ the absence, and no byte figure
would add anything.

`node scripts/size-check.mjs --modules` prints the full comvi module list behind every sentinel row.
That output is the before/after diff input when a sentinel starts failing.

## 3. The budget rule: measured + 5 %

> `gzipBudgetBytes = ceil(baseline.gzipBytes * 1.05)`

Every gated row, no exceptions. `scripts/size-check.test.mjs` asserts this mechanically against the
real `size-budgets.json`, so a hand-edited budget fails the unit test even when the gate passes.

`baseline` records the sweep the budget was derived from: `minBytes`, `gzipBytes`, `measuredAt`, and
— on rows that declare sentinels — `modules`, the comvi module IDs that survived into that bundle.
`baseline` is **evidence, not a gate**. Chunk file names in `baseline.modules` are content-hashed, so
those characters drift on any source edit; only the _set_ of module paths is meaningful.

### Why 5 % and not 2 %

Before the 0.5.0 hardening pass the default was measured + 2 %, with three hand-tuned exceptions
(§6). Rows routinely sat on 1–30 B of headroom, so ordinary work tripped the gate on noise rather
than on weight, and every trip cost a re-baseline. The 0.5.0 pass traded ~3 % of nominal ceiling for
a gate that only fires on real regressions.

### The chunk-hash effect (why single-byte margins do not work)

A row's gzip figure moves by **~1 B per imported content-hashed chunk name** whenever any source edit
changes those hash characters — while the minified payload length does not change at all. The core
build is deterministic (three consecutive builds produced an identical md5), so such a swing is not
flakiness and not weight. Under the old 1 B ceiling on `core-full-composite` this had to be spelled
out as an explicit allowance. Under measured + 5 % it is simply absorbed.

## 4. How to re-baseline

1. Build the dists the gate reads: `pnpm exec turbo run "//#size"` builds them via `dependsOn`, or
   `pnpm build` at the root.
2. Run **one** `node scripts/size-check.mjs`. That single run is authoritative — do not mix figures
   from separate runs into one file.
3. For each gated row, set `baseline.{minBytes,gzipBytes}` to that run's numbers, `baseline.measuredAt`
   to the date, and `gzipBudgetBytes` to `ceil(gzipBytes * 1.05)`.
4. For a sentinel row, refresh `baseline.modules` from the same run (`--modules`).
5. Re-run `node scripts/size-check.mjs` (all green) and `node --test scripts/size-check.test.mjs`.
6. Say in the commit/handoff **which** sweep the file now records.

Re-baselining is not a way to pass a failing gate. A row that grew past +5 % is a finding: explain
the bytes first, then decide whether they ship.

## 5. Row inventory (2026-08-29)

**Byte-gated (15).** `core-base`, `core-base-icu`, `core-full-composite`; per framework
`fw-{react,solid,svelte,vue}-{default,full-composite}`; `fw-next-client-default`,
`fw-next-server-default-loader`, `fw-nuxt-client-default`, `fw-nuxt-full-composite`.

**Sentinel-gated, no byte budget (2).** `probe-react-tags-pinning`, `plugin-editor-production-with`.

**Informational, sentinels retained (12).** Every other framework row — the `-default-t`, `-icu` and
Next/Nuxt variants. They keep their absence claims (which are stable and cheap) and drop only the
byte figure (which was the maintenance cost).

**Informational, no sentinels (13).** The core delta rows (`core-base-tags`, `core-base-icu-tags`,
`core-base-icu-installer`, `core-base-loader`, `core-base-loader-tags`), `fw-vue-default-composed`,
`fw-next-composed-factory`, and the six plugin rows (three `use`/`with` pairs plus the guards pair).
Each exists to make a _delta_ visible; none is a ceiling.

Several rows are deliberately paired — `plugin-guards-baseline` / `plugin-guards`,
`plugin-fetch-loader-use` / `-with`, `plugin-locale-detector-use` / `-with`, `fw-vue-default` /
`fw-vue-default-composed`, `core-base-icu` / `core-base-icu-installer`. Deleting one half turns the
other from a measurement into a bare number; keep or delete pairs together.

## 6. Retired ceilings, with their provenance

The 0.5.0 hardening pass retired all three hand-tuned budgets and put those rows on measured + 5 %.
Recorded here so no one reintroduces them by accident:

| row                   | retired ceiling | what it was                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-base`           | **5046 B**      | The _base-successor drift rule_: measured + 32 B, inherited from the pre-convergence `slim` row (tier-3 B measurement 4902 + 32 = 4934), re-derived at the single-entry landing as 5014 + 32. The row then measured 5016 through chunk-hash characters alone with the payload unchanged, and the budget was deliberately not re-widened — leaving 30 B of real headroom on a row whose noise floor is ~1 B per chunk. |
| `core-base-icu`       | **7680 B**      | Frozen, not derived. It carried ~1.8 KB of dead headroom (the row measured 5890 B) and its ratchet was a named post-0.5.0 release-captain follow-up. The hardening pass performed that ratchet by putting the row on the standard rule.                                                                                                                                                                               |
| `core-full-composite` | **8605 B**      | An owner-signed hard ceiling with no automatic margin. Provenance: the pre-convergence `full` row was user-signed at 8598 B (8404 + 2 %); single-entry P1 recomposed identical behaviour on the base host and the owner re-signed 8605 B after deterministic chunk-name noise. It ran on 1–5 B of headroom, with the chunk-hash effect written into the row's note as an explicit allowance.                          |

The 0.4-era default of **measured + 2 %** is retired for the same reason.

## 7. History — what moved the numbers

Kept because each entry explains a step change a future reader would otherwise mistake for drift.
Every figure below is **historical**; the current numbers are in `size-budgets.json`.

**framework-slim tier-3 A** (`.omc/handoffs/fs-tier3.md` §1) — `useDefineForClassFields: false`
removes the `__publicField` lowering from all 35 `I18n` class fields: **−191 B** min+gz on each core
entry, **−174..−200 B** on each framework fixture. No fixture's graph changed; every row was
re-derived from the new measurement under the then-current convention. The `core-ng` spike
(`.omc/handoffs/core-ng-spike.md`) is the companion finding: a closure/factory core buys **+14 B**
against the flag-flipped class — i.e. the tsconfig flag, not the object model, was the whole win —
while costing 1.2–1.45× on warm `t()`, 9.4–9.7× on construction and 4.05× per-instance heap.

**framework-slim tier-3 B** (`fs-tier3.md` §2) — the clean-trio capability extraction: C1 devtools
discovery → the new `@comvi/core/devtools` subpath; C5a tag-grammar entities/escape → the tags
extension; C6 nested-catalog flattening → the loader capability plus the pure `flattenCatalog`
export. The slim family dropped again; the root and root-host rows rose 38–65 B because the
then-batteries-included root composed all three capabilities back in across chunk boundaries — still
114–135 B **below** the pre-tier-3 anchor, so gate G5 (root-host rows must not regress > 2 %) was
satisfied by improvement rather than by margin.

**framework-slim (perf)** (`.omc/handoffs/ctor-perf.md`) — restored the root constructor's
first-catalog-write fast path: **+6..+11 B** min+gz on every core-dependent row. Deliberately not
re-baselined at the time: absorbing a change that small is what a margin is for.

**single-entry P1** — the convergence itself. `slim*` rows became `core-base*` (the root **is** that
host now), `full` became `core-full-composite` (0.4 semantics recomposed with `.with(...)` in the
parity order — parity proved by `packages/core/tests/features/composite-parity.test.ts`),
`fw-next-root` became `fw-next-composed-factory`, and the two informational `/icu`-installer rows
were added. Δbase over the historical Dx2 `slim` measurement was **+99 B**: the structured
`E_ICU_SYNTAX` detector, the C4n one-argument facade, the pre-ingestion compiler lock, the (0 B) dev
preflight, the (0 B) ambient-tag warning, and the chunk-layout shift from retiring the second host
entry.

**single-entry P3** — the solid ∥ svelte ∥ vue wrapper ladders converged in one sweep: five
root/root-t/slim/slim-t/slim-preset rows per package collapsed into four (`-default`, `-default-t`,
`-icu`, `-full-composite`) measured through the package's **one** published specifier, plus vue's
extra informational `fw-vue-default-composed` row so its preset glue stays measured rather than
claimed. Every pre-convergence wrapper anchor is historical and pre-dates the core cutover.

**single-entry P4** — the next and nuxt ladders renamed on the same convention
(`fw-next-server-slim-loader` → `fw-next-server-default-loader`,
`fw-next-client-slim-preset` → `fw-next-client-default`, which also absorbed the two-specifier
`fw-next-client-slim` row — one graph that had been reached through two specifiers).

**single-entry P5** — added two plugins-only misuse guards to `core/plugins.ts` (`ensureInstallable`
and the `_beforeInit` return-shape branch), moving every graph that contains `comvi-core-plugins.js`.
`core-base-loader` carried a `STALE ANCHOR` marker from that point until the 2026-08-29 sweep, which
re-measured it.

**The loader recipe cost** (framework-slim DX-2) — retargeting `core-base-loader` to the documented
`.with(loader({…})).with(plugins())` took it from 6337 → 6461 B (**+124 B**) at that commit. That
delta _is_ the configured-installer cost, and it is almost entirely the import-map adapter that
`loader` names statically. Measured alternatives at the same commit: the call form
`attachPlugins(attachLoader(i18n))` 6337 B, and `.with(attachLoader).with(attachPlugins)` 6340 B —
the pipe itself costs **3 B** at a call site. A host with a plain `LoaderFn` should compose
`.with(attachLoader)`; `loader(map)` is for hosts that already have an import map.

**0.5.0 hardening, Phase 4 (2026-08-29)** — this pass. One authoritative sweep re-baselined every
remaining row; 33 byte-gated rows became 15; the three hand-tuned ceilings of §6 were retired for
measured + 5 %; the `core-base-loader` stale anchor was cleared; `core-base-icu-locked` was deleted
(same module graph and identical gz as `core-base-icu-installer` — its note said so, and the lock's
behaviour is covered by tests, not bytes); the ~34 KB `note` string moved into this file and every
JSON note became one line. No `pending` rows remain, and none should be reintroduced: `pending`
skips a row's **sentinels** too, so a row that cannot be measured yet should be added when it can.
