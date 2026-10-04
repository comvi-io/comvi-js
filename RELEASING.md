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
- [ ] On npmjs.com, every one of the 12 packages' trusted publisher (this repository,
      `release.yml`) has **Allow npm dist-tag** enabled. It is off by default, and without it the
      promotion step cannot move `latest` or `next`: the run then ends with everything on npm
      under the staging tag only and exits 1. The workflow installs npm 11.21.0, the first npm 11
      whose OIDC token covers `npm dist-tag`.
- [ ] Read the pending changesets. Note that **`changeset status` reports a version the cut will not
      produce**: on a branch whose plugin peer ranges still point at the previous major-minor,
      `pnpm exec changeset status --verbose` escalates the whole fixed group to `1.0.0`, because
      `onlyUpdatePeerDependentsWhenOutOfRange` sees the next version falling outside those ranges.
      `pnpm release:version` runs `scripts/sync-peer-ranges.mjs` **before** `changeset version`
      (`scripts/version-release.mjs`), which is what produces the real number. To preview it, run
      `node scripts/sync-peer-ranges.mjs && pnpm exec changeset status --verbose` in a throwaway
      tree, and never run bare `pnpm changeset version` in place of `pnpm release:version`.

## 2. RC rehearsal (optional but recommended)

Dispatch `Release` with the `rc` input set to the rc number. Three jobs run, and none holds more than
it needs:

1. `rc-pack` (read-only) rewrites versions in its own working tree only (`scripts/rc-version.mjs`),
   builds after the rewrite so the inlined runtime version matches what npm receives, asserts that
   with `node tooling/check-inlined-version.mjs`, and runs `scripts/publish-candidate.mjs pack`: it
   packs once, writes `SHA256SUMS`, and uploads the tarballs. The digest of `SHA256SUMS` is its
   output.
2. `rc-verify` (read-only, no npm token, writes no outputs) downloads those tarballs and runs
   `examples:e2e` in both modes against them (`--tarballs`). It installs third-party packages, so it
   is treated as untrusted: it can stop a publish, never shape one.
3. `rc-publish` holds the OIDC token, installs and builds nothing, downloads `rc-pack`'s artifact,
   checks `SHA256SUMS` against `rc-pack`'s digest and the directory against `SHA256SUMS` (any file
   not listed is refused), reads each tarball's name and version from its own `package.json`, and
   publishes those files with `npm publish <tgz>`. It uses the same two phases as GA: the files are
   published under the candidate's staging dist-tag, and `next` moves only once npm has the whole
   set. The difference is that npm keeps every version it accepted, so after a partial RC some
   versions exist under the staging tag only. That is tolerable for a rehearsal: re-run
   `rc-publish` to finish it, or dispatch the next rc number.

Dispatch it from a green ref: apart from that browser suite the jobs run no tests.

## 3. The cut

- [ ] Merge the release branch to `main`.
- [ ] The `main` push runs `release.yml`, which calls `pnpm release:version` through
      `changesets/action` and opens the release PR. Re-run `pnpm examples:verify` after the version
      bump: that is when the peer ranges and the examples' ranges meet.
- [ ] Read the generated CHANGELOGs before merging the release PR.
- [ ] Merging the release PR publishes through the `pack`, `verify` and `publish` jobs: the same
      three-job chain as the RC, with `--tag latest` and git tags pushed for each published
      package. A red `examples:e2e` on the candidate stops the publish before anything reaches npm;
      its diagnostics are the `release-ga-examples-e2e` artifact.
- [ ] **The candidate is one transaction.** Every tarball is published under a staging dist-tag
      of the candidate, `release-<first 12 hex of the SHA256SUMS digest>`, never directly under
      `latest`. A failed `npm publish` does not stop the others. After the attempts the job asks npm
      about every tarball in `SHA256SUMS` and logs a table: `on npm` or `MISSING`, and `on latest`
      or `NOT on latest`, per package. Only when the whole set is on npm does it move `latest`,
      with `npm dist-tag add` for each package not already there, and then remove the staging tag.
      Each version npm has gets its git tag at the checked-out release commit. Only when every
      package is on `latest` does the job also push `v<version>` at that same commit and report
      `published=true` with the full set. Otherwise it reports `published=false`, exits 1, and no
      GitHub Release is created. A partial train is on npm only under the staging tag, so
      `npm i @comvi/<pkg>` keeps resolving to the previous release.
- [ ] **To finish a partial or failed publish,** use "Re-run failed jobs" on the `publish` job. A
      fresh workflow run does not work, because `pack` then finds nothing pending. The re-run
      skips what npm has, publishes the rest, moves `latest` for every package not yet on it
      (including after a crash between publishing and promotion), and pushes any missing tag,
      including the tag of a version an earlier run published but never tagged. An existing tag at a different commit
      stops the job with both SHAs: decide by hand, and never move a tag that names released bytes.
- [ ] `.github/scripts/create-combined-release.mjs` then creates the combined GitHub Release from
      the candidate tarballs. It refuses unless `v<version>` exists at the checked-out commit and
      the published set is everything `SHA256SUMS` lists. It passes `--verify-tag` to
      `gh release create`, so the tag is never created from the default branch's newer head. The
      tag is the release train's version; independently versioned packages appear in the notes and in
      `manifest.json` at their own version. If that step fails, npm is already live: re-run the
      `publish` job, which reconciles everything and reaches the release step again. By hand, from
      the release commit with the tags fetched, run it with `PUBLISHED_PACKAGES=<the full set>` and
      `COMVI_RELEASE_TARBALLS_DIR=<the downloaded candidate>`.

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

- The RC jobs run the browser suite on the candidate but no unit tests, package-contract or size
  gate.
