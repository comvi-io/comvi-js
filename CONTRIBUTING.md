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
packages/locale-routing            framework-neutral locale routing primitives (runtime library)
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

| Job         | What it runs                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`   | changeset guard (pull requests only), `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `node scripts/audit-published.mjs`, `pnpm test:release-tools` |
| `tests`     | `pnpm test:commit`                                                                                                                                      |
| `build`     | `pnpm build`, then `pnpm audit:package-contracts`, `pnpm check:publint`, `pnpm check:types-exports`, `pnpm size`, `pnpm bundler-matrix`                 |
| `extension` | `pnpm extension:build`, the built-artifact test, a chromium install, Gate E (`pnpm --filter @comvi/chrome-extension test:e2e`), diagnostics upload      |

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

`pnpm size` measures 17 gated bundle rows (`scripts/size-budgets.json`) by bundling each entry
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

## Verification cheat-sheet

| You changed                              | Run at least                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/core`                          | `pnpm --filter @comvi/core test`, the affected bindings' tests, `pnpm build && pnpm size`      |
| One binding                              | that package's tests, and its `test-apps/*` app builds                                         |
| A plugin                                 | that plugin's tests                                                                            |
| A `package.json` `exports` map           | `pnpm build && pnpm audit:package-contracts && pnpm check:publint && pnpm check:types-exports` |
| Package entry points or `sideEffects`    | `pnpm build && pnpm bundler-matrix`                                                            |
| Release or codemod scripts in `scripts/` | `pnpm test:release-tools`                                                                      |
| The Chrome extension                     | `pnpm extension:test`, and `pnpm extension:gate-e` for E2E                                     |

`pnpm perf` prints a core runtime performance table. It is a manual tool, not a gate; nothing in
CI runs it.

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
