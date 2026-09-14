# Contributing to Comvi i18n

Thanks for wanting to help. This document is the short version of what CI checks and why, so
your first pull request passes the gate instead of discovering it one red job at a time.

Contributions of every size are welcome: bug reports, reproductions, docs fixes, new tests, and
code. By contributing you agree that your work is licensed under the repository's
[MIT License](LICENSE).

## What this repository is

A pnpm 9 + Turborepo monorepo holding a framework-agnostic i18n runtime and its bindings.

```
packages/core                      framework-agnostic runtime; everything else depends on it
packages/{vue,react,solid,svelte,next,nuxt}   framework bindings; kept in behavioural parity
packages/plugin-fetch-loader       loads translations from the Comvi CDN/API
packages/plugin-locale-detector    browser locale detection
packages/plugin-in-context-editor  visual in-page translation editor
packages/locale-routing            WORKSPACE-PRIVATE locale routing primitives; inlined into next,
                                   vendored into nuxt's runtime (`pnpm --filter @comvi/nuxt vendor`)
packages/typegen                   WORKSPACE-PRIVATE declaration emitter; inlined into cli and
                                   vite-plugin, declarations bundled into their `.d.ts`
packages/{cli,vite-plugin}         tooling packages
apps/chrome-extension              in-context editor extension (own `extension:*` scripts)
test-apps/*                        one integration app per framework; used by tests, not published
tooling/, scripts/                 repo checks: package contracts, publint, size budgets, release
```

There is **no `docs/` folder**. User-facing documentation lives at
<https://comvi.io/docs/i18n/> and in each package's `README.md`. If your change alters public
behaviour, update the relevant package README in the same pull request.

## Getting started

Prerequisites: Node.js 22 or newer, pnpm 9 or newer, Git.

```bash
git clone https://github.com/comvi-io/comvi-js.git
cd comvi-js
pnpm install
pnpm build            # packages only, dependency-ordered through turbo
pnpm test             # vitest via turbo; depends on build
```

Day-to-day development:

```bash
pnpm dev              # packages + test apps
pnpm dev:lib          # packages only — faster, less memory
```

Most packages are consumed through source imports, so edits are reflected immediately.
`@comvi/plugin-in-context-editor` runs in watch mode and rebuilds on change. `Ctrl+C` stops dev
mode cleanly.

Scope any turbo task with a filter:

```bash
pnpm --filter @comvi/core test
pnpm --filter @comvi/vue build
turbo run build --filter='./packages/*'
```

## The gates, in the order CI runs them

`.github/workflows/ci.yml` is four jobs, and that is the entire automated gate set. Nothing
outside this list is checked automatically.

| Job         | What it runs                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`   | changeset guard (pull requests only), `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `node scripts/audit-published.mjs`, `pnpm test:release-tools`, `pnpm check:snippets`, `node scripts/examples-sync-locales.mjs --check` |
| `tests`     | `pnpm test:commit`                                                                                                                                                                                                               |
| `build`     | `pnpm build`, then `pnpm check:inlined-version`, `pnpm audit:package-contracts`, `pnpm check:publint`, `pnpm check:types-exports`, `pnpm size`, `pnpm bundler-matrix`                                                            |
| `extension` | `pnpm extension:build`, the built-artifact test, a chromium install, Gate E (`pnpm --filter @comvi/chrome-extension test:e2e`), diagnostics upload                                                                               |

Everything that reads `dist/` lives in the single `build` job, after the build. Splitting those
steps across jobs is what previously let them run against a stale or missing `dist/`.

Before pushing, `pnpm test:commit` reproduces the `tests` job locally. `pnpm test:pr` adds the
build.

### 1. Changesets are required, and CI enforces it

Any change touching `packages/*/src/**` or a package's own `package.json` needs a
`.changeset/*.md` entry in the same pull request. The guard greps the diff, and a pull request
without one fails before anything else runs.

```bash
pnpm changeset        # pick packages, pick a bump, write the summary
```

Tests, docs and config under `packages/` do not ship, so they do not need one.

Write the summary for a user reading the changelog, not for a reviewer reading the diff: say
what changed in behaviour and what a consumer has to do about it. Twelve of the thirteen
published packages are in a `fixed` group (`.changeset/config.json`), so any bump moves them all
to the same version.

### 2. Formatting, linting, types

```bash
pnpm format:check     # prettier, CI-equivalent
pnpm format           # write the fixes
pnpm lint             # eslint via turbo, --max-warnings=0
pnpm lint:fix
pnpm typecheck        # packages + apps + test-apps
```

Prettier and ESLint also run through husky and lint-staged on commit.

### 3. Size budgets

`pnpm size` measures 18 gated bundle rows (`scripts/size-budgets.json`) by bundling each entry
through its **published** exports map with esbuild, minifying, and gzipping. It needs a build
first.

```bash
pnpm build && pnpm size
```

A green row prints `+ name: 5.00 KB (5119 B) min+gz <= budget …`. A red row prints the overage
and exits non-zero. Read it as a question, not a verdict: the budget is the last measured
baseline plus 5 %, so red means your change added weight that nobody has justified yet. Shrink
the change, move the cost behind an opt-in import, or re-baseline deliberately. The rules for
re-baselining are in `scripts/size-budgets.md`; do not raise a budget in the same commit that
grew it without saying why in the changeset.

`packages/core` is size-critical. Avoid new dependencies and dead weight there.

### 4. Bundler matrix

```bash
pnpm build && pnpm bundler-matrix
```

Packs real tarballs, installs them into a fixture app, and bundles that app with **webpack and
vite, in development and production**. It proves the export conditions work as shipped: that the
`development` condition really reaches the dev build, that the editor's `production` condition
really drops the editor runtime from the graph, and that no entry point resolves to nothing.
Any change to a package's entry points, `exports` map, or `sideEffects` needs this run.

### 5. Package contracts

```bash
pnpm build && pnpm audit:package-contracts && pnpm check:publint && pnpm check:types-exports
```

These check that every `exports`/`main`/`module`/`types` target is actually packed, that publint
is happy with the manifest, and that every declared types entry resolves and is not an empty
stub. Do not hand-edit a `package.json` `exports` map without running all three.

### 6. Runtime perf, against the last release

`pnpm perf` on its own prints a table for one build, which says nothing on its own — the numbers
are machine-local. The gate is the A/B form, and it is **required before a release**:

```bash
pnpm build
node scripts/perf.mjs --compare-ref v0.4.1        # or the tag/SHA you are releasing against
```

It builds the reference into a reusable worktree under `.perf-ref/`, then measures both sides
interleaved — every case on the reference, then on your build, each in its own process, three
repetitions, keeping the minimum per side. It exits non-zero when any of the five cases
(construction, `t()` static, `t()` with a param, an ICU plural, a rich-text prepare) regresses by
more than 5 %.

Read a Δ against the harness's own noise first. A run of the reference against **itself**
(`--compare <ref-dist> <ref-dist>`) is ±2–4 % on the sub-µs cases on a typical laptop, so a 3 %
difference is not a finding and a 13 % one is. Nothing in CI runs this, which is exactly why it
belongs on the release checklist: the 0.5.0 branch reached its release candidate with every other
gate green and a 12.9 % ICU-plural regression that only this comparison could see.

Exit 3 means the reference cannot be compared — its build predates an entry point the protocol
loads (`@comvi/core@0.4.1` is a single-entry monolith, so it has no `comvi-core-icu.js`). Compare
the branch point of the cycle that introduced the entries instead.

### 7. The StackBlitz examples build, against locally packed 0.5

`examples/*` are seven one-page apps — five Vite, plus `next` and `nuxt` — that depend on the
**published** names at `^0.5.0` and are deliberately outside `pnpm-workspace.yaml`. A
`workspace:*` example cannot be opened in a WebContainer, which is exactly why `test-apps/*`
cannot double as demos. The cost of that is a hole: `pnpm install` at the root ignores them and
turbo never sees them, so before 0.5.0 is on npm nothing would ever compile them.

```bash
pnpm examples:verify                  # all seven: install, build, typecheck, size probe
pnpm examples:verify --only next      # one
```

It packs all fourteen packages and pins every `@comvi/*` — direct and transitive — to a local
tarball through `pnpm.overrides`, then runs `pnpm install`, `pnpm build` and each example's own
typecheck in a temp directory outside every workspace. The committed `^0.5.0` ranges are not
rewritten, and no lockfile in this repository is read or written.

Each example is classified by the CLI its own `build` script runs — `vite`, `next` or `nuxt` —
and that KIND picks the size probe, because the three build tools do not put the entry chunk in
the same place and neither SSR framework's first load is one file at all. `vite`: the chunk
`dist/index.html` names. `next`: the route's list in `.next/app-build-manifest.json`, page plus
enclosing layouts. `nuxt`: the `isEntry` chunk **and** the route chunk from the Vite client
manifest, each closed over its static `imports` — those are `modulepreload` links the browser
cannot skip, and measuring the entry alone under-reported the Nuxt example by half. The report's
two counts differ on purpose: `first-load files` is what the route needs before it renders,
`js chunks` is every client `.js` the build wrote, and the gap between them is the lazy split.
A build output no probe can read is an error rather than a blank cell — a missing size must
never read as a small one — so an eighth example on a fourth framework needs a kind and a probe
of its own.

**Required before a release, and again after the version bump.** An override bypasses the range
it replaces, so a green run proves the source compiles, never that `^0.5.0` resolves; and the
bump is the first moment `@comvi/plugin-locale-detector`'s `@comvi/core` peer range and the
examples' ranges meet. The examples install with `auto-install-peers=false` so an unsatisfied
peer is an error here, the way it is for a reader running `npm install`.

Run it from a short checkout path. The temp install references each tarball by absolute path, and
pnpm's store index encodes that path in a filename, so a deep worktree can reach `ENAMETOOLONG`
during install.

`node scripts/examples-sync-locales.mjs --check` is the instant half and does run in CI: it fails
if any example's `src/locales/*.json` has drifted from the shared `examples/locales/`, in either
direction.

## Tests

Vitest everywhere. Every test in this repository is expected to meet the following standards.

1. **Structure.** Arrange, one act, assert, blank-line separated. One scenario per test.
   Behaviour through the public contract, never privates, internal call order, or an `as any`
   reach. Minimal realistic data. Expected values are literals, never re-derived with the code
   under test.
2. **Coverage.** Happy path, plus edge cases (empty, zero, boundaries), plus the error path.
3. **Stability.** Fully independent: every global restored. `restoreMocks`, `unstubEnvs` and
   `unstubGlobals` are on, but spies on inherited members and `beforeAll` stubs are not covered
   by them, so restore those yourself. Deterministic: no `Date.now`, `Math.random`, or ambient
   timezone in an assertion; pass an explicit locale and `timeZone`. No `sleep` or `delay`; use
   fake timers, deferreds, `vi.waitFor`, or the package's own flush helper. E2E selectors by id,
   role, or `data-testid`.
4. **Debuggability and speed.** Name a test `<subject> <condition> → <expected>`. Use precise
   matchers (`toBe`, `toEqual`, `toThrow(objectContaining({ code }))`), never `toBeTruthy` for a
   real claim, never try/catch-then-expect. Loop assertions must name the failing row, so use
   `it.each`. Fast enough to run before every commit.

**A real defect found while writing tests is reported as a bug to fix, loudly, at the moment it
is found.** Pinning wrong behaviour "as is" is not acceptable as a silent outcome. If a pass is
deliberately source-frozen, the pinned test carries an explicit BUG marker and the follow-up fix
flips it to the correct behaviour with a changeset.

Changing `packages/core` usually means mirroring the behaviour and its tests into every binding.
Check all of `packages/{vue,react,solid,svelte,next,nuxt}` before calling core work done. SSR
matters too: `next`, `nuxt` and server-rendered Vue paths must not touch browser globals at
import time.

### Mutation testing

Not a CI gate, but the tool that tells you whether a test suite makes the claims it appears to.

```bash
pnpm mutation packages/core     # Stryker; report at packages/core/.stryker/report.html
```

A surviving mutant is a claim your tests do not make. Kill it with a behaviour test. A mutant
that is genuinely equivalent at the behaviour level, or unreachable in the dev test build, is
recorded in `scripts/mutation/accepted.json` — never as a comment in `src/`. An entry names the
`package` and the `file`, the `mutators` it covers, the `snippet` (the mutated line's text), a
`lineHint`, a `reason`, and a `kind`, which is one of `equivalent`, `gap:prod-build`,
`tooling:static-mutant`, `tool-limitation`, or `needs-seam`. Omitting `package` or `snippet`
produces an entry that matches nothing and the runner reports it as stale. The runner prints the
adjusted score, the real survivors, and any accepted entry that has gone stale.

`src/**/__fixtures__/**` is excluded from `mutate` alongside `__tests__` and `*.test.ts`: a
fixture is the oracle a test checks against, not logic under test, so mutating it only asks
whether the tests notice their own expected value changing. Keep fixtures to plain data. A
fixture that grows a builder function is real logic hiding in an unmeasured directory — move it
into `src/` proper, or into the test tree where it is exercised directly.

## Verification cheat-sheet

| You changed                           | Run at least                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`                       | `pnpm --filter @comvi/core test`, the affected bindings' tests, `pnpm build && pnpm size`; add `node scripts/perf.mjs --compare-ref <ref>` for a hot-path change |
| One binding                           | that package's tests, and its `test-apps/*` app builds                                                                                                           |
| A plugin                              | that plugin's tests                                                                                                                                              |
| A `package.json` `exports` map        | `pnpm build && pnpm audit:package-contracts && pnpm check:publint && pnpm check:types-exports`                                                                   |
| Package entry points or `sideEffects` | `pnpm build && pnpm bundler-matrix`                                                                                                                              |
| Release scripts in `scripts/`         | `pnpm test:release-tools`                                                                                                                                        |
| The Chrome extension                  | `pnpm extension:test`, and `pnpm extension:gate-e` for E2E                                                                                                       |
| `examples/*` or its scripts           | `node scripts/examples-sync-locales.mjs --check` (also in CI), and `pnpm examples:verify` — see gate 7                                                           |

Nothing in CI runs `node scripts/perf.mjs --compare-ref <ref>` (see gate 6). Run it yourself for a
change to core's hot path — `t()`, the template cache, the parser, a compiler — and always before
a release.

Nothing in CI runs `pnpm examples:verify` either (see gate 7). It is required before a release,
and required again immediately **after** the version bump.

`pnpm test:release-tools` also covers the release gates outside `scripts/`: `.github/scripts/` and
the checks in `tooling/`. Cutting a release itself is [RELEASING.md](./RELEASING.md).

## Pull requests

1. Fork, then branch from `main`.
2. Make the change, with tests.
3. Add a changeset if you touched `packages/*/src/**` or a package's `package.json`.
4. Update the affected package README if public behaviour changed.
5. Run `pnpm test:commit`, plus whatever the cheat-sheet above adds for your change.
6. Open the pull request. CI runs the four jobs; a maintainer reviews.

Use TypeScript for new code. Formatting is Prettier's business, not yours.

## Reporting bugs

Open an issue at <https://github.com/comvi-io/comvi-js/issues>. A good report has a summary,
exact reproduction steps or a minimal repository, the expected behaviour, the actual behaviour,
and the versions of the Comvi packages, the framework, and Node.

Security issues should not go in a public issue. See `SECURITY-AUDIT.md` for the audit trail and
contact the maintainers privately at <hello@comvi.io>.

## A note on `.omc/` and `.omp/`

Both directories are agent-orchestration artifacts: plans, handoff notes and review records
produced while the maintainers develop the library with AI coding agents. They are working
process, not project documentation, and are untracked and gitignored. If you see them in your
checkout after running tooling, ignore them; nothing in the build, the tests or the release path
reads from them.
