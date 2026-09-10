# Releasing

The release captain (repo owner) runs this checklist. It covers the parts of a cut that live in this
repository; the gates themselves are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

The publishable set is 14 packages: 13 in the `fixed` group of `.changeset/config.json`, which always
share one version (the release train), plus `@comvi/locale-routing`, which is versioned independently
and keeps its own version in the tags, notes and archive.

## 1. Before the cut

- [ ] **Owner action, npm trusted publishing for the two brand-new package names.** `@comvi/typegen`
      and `@comvi/locale-routing` have never been published. `.github/workflows/release.yml` carries
      no `NODE_AUTH_TOKEN`/`NPM_TOKEN` and `.npmrc` holds no publish token: authentication is purely
      OIDC trusted publishing, which is configured **per package** on npmjs.com and therefore needs
      the package name to exist first. Resolve both names on npm before any publish (GA or RC), or
      the run half-publishes: the failure happens inside `changeset publish`, after some of the other
      packages are already live. This step is manual and is not automated by anything in this repo.
- [ ] `pnpm test:release` locally (it is not a single CI job; its constituents are split across the
      `quality`, `tests` and `build` jobs).
- [ ] `pnpm size`, `pnpm bundler-matrix` (add `--from-registry next` to measure the published RC
      instead of the local `dist`), and `node scripts/perf.mjs --compare-ref <last release ref>`.
- [ ] Read the pending changesets. Note that **`changeset status` reports a version the cut will not
      produce**: on a branch whose plugin peer ranges still point at the previous major-minor,
      `pnpm exec changeset status --verbose` escalates the whole fixed group to `1.0.0`, because
      `onlyUpdatePeerDependentsWhenOutOfRange` sees the next version falling outside those ranges.
      `pnpm release:version` runs `scripts/sync-peer-ranges.mjs` **before** `changeset version`
      (`scripts/version-release.mjs`), which is what produces the real number. To preview it, run
      `node scripts/sync-peer-ranges.mjs && pnpm exec changeset status --verbose` in a throwaway
      tree, and never run bare `pnpm changeset version` in place of `pnpm release:version`.

## 2. RC rehearsal (optional but recommended)

Dispatch `Release` with the `rc` input set to the rc number. The job rewrites versions in its own
working tree only (`scripts/rc-version.mjs`), builds after the rewrite so the inlined runtime version
matches what npm receives, asserts that with `node tooling/check-inlined-version.mjs`, and publishes
under the `next` dist-tag. Dispatch it from a green ref: the job runs no tests of its own.

## 3. The cut

- [ ] Merge the release branch to `main`.
- [ ] The `main` push runs `release.yml`, which calls `pnpm release:version` through
      `changesets/action` and opens the release PR. Re-run `pnpm examples:verify` after the version
      bump: that is when the peer ranges and the examples' ranges meet.
- [ ] Read the generated CHANGELOGs before merging the release PR.
- [ ] Merging the release PR publishes, then `.github/scripts/create-combined-release.mjs` creates
      the combined GitHub Release. The tag is the release train's version; independently versioned
      packages appear in the notes and in `manifest.json` at their own version. If that step fails,
      npm is already live: fix and re-run it (or run it by hand with `PUBLISHED_PACKAGES=…`).

## 4. After GA

- [ ] **Retire the `next` dist-tag.** The RC rehearsal publishes under `--tag next` and nothing moves
      it afterwards, so `npm i @comvi/core@next` keeps resolving to the RC after GA ships. For every
      package the rehearsal published, either remove the tag or point it at the GA version:

  ```sh
  # inspect first
  npm dist-tag ls @comvi/core
  # then, per package
  npm dist-tag rm @comvi/<pkg> next
  ```

      The 14 published names are `cli`, `core`, `locale-routing`, `next`, `nuxt`,
      `plugin-fetch-loader`, `plugin-in-context-editor`, `plugin-locale-detector`, `react`, `solid`,
      `svelte`, `typegen`, `vite-plugin`, `vue`.

- [ ] Re-snapshot the test manifest, and keep the post-release observation window.

## Known release-tooling gaps (recorded, not fixed)

- A `@comvi/locale-routing`-only release still bumps all 13 fixed-group packages through
  `updateInternalDependencies: patch` (via `@comvi/next` and `@comvi/nuxt`), so every future
  locale-routing patch republishes the whole train with empty changelog sections. Decide before GA
  whether locale-routing joins the fixed group or the dependency range becomes a peer range.
- The `rc` job publishes after a build only (no tests, no package-contract or size gate) and inherits
  the workflow-level `contents: write` it does not need.
