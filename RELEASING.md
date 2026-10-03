# Releasing

The release captain (repo owner) runs this checklist. It covers the parts of a cut that live in this
repository; the gates themselves are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

The publishable set is 12 packages, and all 12 are in the `fixed` group of `.changeset/config.json`:
one release train, one version, one tag. `packages/locale-routing` and `packages/typegen` are
WORKSPACE-PRIVATE (`"private": true`, and in the config's `ignore` list): they are the single copy of
code that is inlined into `@comvi/next`, `@comvi/cli` and `@comvi/vite-plugin` at build time and
vendored into `@comvi/nuxt`'s runtime, and they publish nothing. Every gate that enumerates packages
derives the set from the `private` flag or from that config — `tooling/typed-packages.mjs` is the one
hand-written list, and it holds the same 12.

The release tooling still supports an independently versioned package (one published outside the
`fixed` group keeps its own version in the tag body, `manifest.json` and the archive). Nothing uses
that path today.

## 1. Before the cut

- [ ] `pnpm test:release` locally (it is not a single CI job; its constituents are split across the
      `quality`, `tests` and `build` jobs). It ends with `pnpm check:snippets:types`, which compiles
      every README fence against the `dist` the same run just built — so it fails on a snippet that
      the published packages would not compile, which is the last moment that is cheap to fix.
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
matches what npm receives, asserts that with `node tooling/check-inlined-version.mjs`, then runs
`scripts/publish-candidate.mjs`: it packs once, prints each tarball's sha256, runs `examples:e2e` in
both modes against those files (`--tarballs`), and publishes the same files with
`npm publish <tgz>` under the `next` dist-tag. Dispatch it from a green ref: apart from that browser
suite the job runs no tests of its own.

## 3. The cut

- [ ] Merge the release branch to `main`.
- [ ] The `main` push runs `release.yml`, which calls `pnpm release:version` through
      `changesets/action` and opens the release PR. Re-run `pnpm examples:verify` after the version
      bump: that is when the peer ranges and the examples' ranges meet.
- [ ] Read the generated CHANGELOGs before merging the release PR.
- [ ] Merging the release PR publishes through `scripts/publish-candidate.mjs` (the same
      pack-verify-publish path as the RC, with `--tag latest --git-tag`). A red `examples:e2e` on the
      candidate stops the publish before anything reaches npm; its diagnostics are the job's
      `release-ga-examples-e2e` artifact. Then `.github/scripts/create-combined-release.mjs` creates
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

      The 12 published names are `cli`, `core`, `next`, `nuxt`, `plugin-fetch-loader`,
      `plugin-in-context-editor`, `plugin-locale-detector`, `react`, `solid`, `svelte`,
      `vite-plugin`, `vue`. None of them is a new npm name — the only two brand-new names 0.5
      introduced are the two that are now workspace-private — so no per-package OIDC
      trusted-publishing setup is outstanding before a publish.

- [ ] Re-snapshot the test manifest, and keep the post-release observation window.

## Known release-tooling gaps (recorded, not fixed)

- The `rc` job runs the browser suite on its candidate but no unit tests, package-contract or size
  gate, and inherits the workflow-level `contents: write` it does not need.
