# Releasing

The release captain (repo owner) runs this checklist. It covers the parts of a cut that live in this
repository; the gates themselves are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

The publishable set is 10 packages, and all 10 are in the `fixed` group of `.changeset/config.json`:
one release train, one version, one tag. They are `@comvi/cli`, `@comvi/core`, `@comvi/editor`,
`@comvi/next`, `@comvi/nuxt`, `@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vite-plugin`
and `@comvi/vue`. `packages/locale-routing` and `packages/typegen` are WORKSPACE-PRIVATE
(`"private": true`, and in the config's `ignore` list) and publish nothing: they are the single
copy of code that other packages carry. `@comvi/typegen` is inlined into `@comvi/cli`,
`@comvi/vite-plugin`, `@comvi/next` and `@comvi/nuxt` at build time; `@comvi/locale-routing` is
inlined into `@comvi/next` and vendored into `@comvi/nuxt`'s runtime. Every gate that enumerates
packages derives the set from the `private` flag or from that config, except
`tooling/typed-packages.mjs`, the one hand-written list: it holds the 9 published packages that
ship type declarations, every one of the 10 except `@comvi/editor`, whose only export is a classic
script.

The browser extension (`apps/chrome-extension`, `@comvi/chrome-extension`) is private as well and
in the config's `ignore` list. Its version is set by hand in `manifest.json` and `package.json`,
and no workflow of this repository builds or publishes it: section 4 is the procedure.

The release tooling still supports an independently versioned package (one published outside the
`fixed` group keeps its own version in the tag body, `manifest.json` and the archive). Nothing uses
that path today.

## 1. Before the cut

- [ ] `pnpm test:release` locally. It is not a single CI job: its constituents are split across the
      `Quality and security`, `Package tests`, `Build, package contracts, size and bundler matrix`
      and `Examples e2e (…)` jobs of `ci.yml`. It includes `pnpm check:snippets:types`, which
      compiles every README fence against the `dist` the same run just built, so it fails on a
      snippet that the published packages would not compile, which is the last moment that is
      cheap to fix.
- [ ] `pnpm size`, `pnpm bundler-matrix` and `node scripts/perf.mjs --compare-ref <last release ref>`.
- [ ] On npmjs.com, every one of the 10 published packages' trusted publisher (this repository,
      `release.yml`) has **Allow npm dist-tag** enabled. It is off by default, and without it the
      promotion step cannot move `latest` or `next`: the run then ends with everything on npm
      under the staging tag only and exits 1. The workflow installs npm 11.21.0, the first npm 11
      whose OIDC token covers `npm dist-tag`. **Verify both facts against
      [docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers) before GA**:
      they were read there on 2026-10-04 and nothing in CI exercises them. A release candidate
      (section 2) uses the same staging-and-promotion code with `next`, so a published candidate
      proves the OIDC dist-tag path before GA depends on it.
- [ ] **`@comvi/editor` is a new npm name in 0.8.** It replaces `@comvi/plugin-in-context-editor`
      and has never been published, so npm has no trusted publisher for it yet. Before the first
      publish of 0.8 (the first release candidate included), the owner creates the package on
      npmjs.com and adds this repository's `release.yml` as its trusted publisher, with **Allow
      npm dist-tag** on. Without it the train stops at `@comvi/editor`. If npm requires a first
      publish by hand to create the name, decide its version and dist-tag beforehand: it cannot be
      a version the train will publish. The old name is no longer in the workspace or the `fixed`
      group and must never receive a 0.8 version.
- [ ] Read the pending changesets. `pnpm exec changeset status --verbose` shows the version the cut
      will produce. With `@changesets/cli` 3, a plugin peer range that the next version falls
      outside of makes changesets bump the peer dependents by patch, no longer by major (cli 2
      escalated the whole fixed group to `1.0.0`). The ranges themselves are still this repo's
      policy: `pnpm release:version` runs `scripts/sync-peer-ranges.mjs` **before**
      `changeset version` (`scripts/version-release.mjs`), which pins them to the exact version
      being cut, a patch release too (`@comvi/next`'s `@comvi/core` and `@comvi/react` peers).
      The `pack` job refuses a packed tarball whose `@comvi/*` peer or dependency is not its own
      version.
      Never run bare `pnpm changeset version` in place of `pnpm release:version`.

## 2. Release candidates (`rc.N`)

A release is preceded by release candidates `<version>-rc.0`, `-rc.1`, … published under the npm
dist-tag `next`. The cycle:

1. **Cut a candidate.** Dispatch `Release` with the `rc` input set to N, from a ref whose head
   commit has a green CI run: `gh run list --commit <sha> --workflow CI` shows `success`. Apart from the
   browser suite below, the candidate's jobs run no tests.
2. **Check it.** The workflow runs `examples:e2e` on the candidate's tarballs itself. By hand,
   against what npm now serves under `next`:
   - `pnpm bundler-matrix --from-registry next`;
   - `node scripts/examples-use-tag.mjs next`, then `pnpm examples:verify` (put the ranges back
     with `node scripts/examples-use-tag.mjs ^<version>` before committing anything);
   - `pnpm docs:quickstart --content <site docs directory> --from-registry next` and
     `pnpm check:strict-consumer --from-registry next`;
   - an extension built against the candidate: section 4, its build and check steps. Whether a
     candidate's build goes to the store is part of the decision at the end of section 4.
3. **The next candidate.** A fix found on `rc.N` lands as its own PR; the gates the change
   touches run on it, and then `Release` is dispatched with the NEXT number, N+1, from the new
   commit. The checks of step 2 that the change can affect run again on `rc.N+1`. Never dispatch
   a number that was already used (see below).
4. **GA.** The last `rc.N` has passed every check of step 2, and
   `git diff <commit of the last rc.N>..<GA candidate> -- packages apps/chrome-extension` holds
   only what the release commit writes: versions and peer ranges in `package.json`, and
   `CHANGELOG.md`. Then section 3.

The candidate is cut by three jobs, and none holds more than it needs:

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
   set. The difference is that npm keeps every version it accepted, so after a partial candidate
   some versions exist under the staging tag only. Use "Re-run failed jobs" on `rc-publish` to
   finish it, or dispatch the next rc number. Do not dispatch the same rc number again: the new
   dispatch packs a new candidate with a new staging tag, and `rc-publish` refuses it, promoting
   nothing, because the versions already on npm hold the first candidate's bytes, not the new
   one's. The RC candidate artifact is kept for 30 days, the same as GA's, so "Re-run failed jobs"
   can download it for as long as GitHub allows the re-run.

A dispatch that leaves `rc` empty is the GA path, and it is refused on every ref except `main`: the
`ga-guard` job fails with the ref it was given, and `version`, `pack`, `verify` and `publish` are
skipped. So a candidate dispatched from a release branch with the input forgotten publishes nothing.

## 3. The cut

- [ ] Merge the release branch to `main`.
- [ ] The `main` push runs `release.yml`, which calls `pnpm release:version` through
      `changesets/action` and opens the release PR. The same commit moves every `@comvi/*` range
      in `examples/*/package.json` and `examples/README.md` to `^<version>`, so the StackBlitz
      badges on `main` ask for the new version only once it is merged (a pre-release version
      leaves them alone). Re-run `pnpm examples:verify` after the version bump: that is when the
      peer ranges and the examples' ranges meet.
- [ ] Read the generated CHANGELOGs before merging the release PR.
- [ ] The release PR needs a green `CI` run on its own commit before it is merged. The PR is
      opened with `GITHUB_TOKEN`, and GitHub starts no workflow for events that token causes, so
      `CI` does not run on it by itself: close the PR and reopen it. The local equivalent is
      `pnpm test:release`, plus `pnpm size`, `pnpm bundler-matrix`, `pnpm test-apps:smoke` and the
      extension's `pnpm --filter @comvi/chrome-extension test:pr`, which `test:release` does not run.
- [ ] Merging the release PR publishes through the `pack`, `verify` and `publish` jobs: the same
      three-job chain as a release candidate, with `--tag latest` and git tags pushed for each published
      package. A red `examples:e2e` on the candidate stops the publish before anything reaches npm;
      its diagnostics are the `release-ga-examples-e2e` artifact.
- [ ] **The candidate is one transaction.** Every tarball is published under a staging dist-tag
      of the candidate, `release-<first 12 hex of the SHA256SUMS digest>`, never directly under
      `latest`. A failed `npm publish` does not stop the others. After the attempts the job asks npm
      about every tarball in `SHA256SUMS` and logs a table: `on npm` or `MISSING`, and `on latest`
      or `NOT on latest`, per package. Only when the whole set is on npm does it move `latest`,
      with `npm dist-tag add` for each package not already there, and then remove every `release-*`
      dist-tag that names the promoted version.
      Each version npm has gets its git tag at the checked-out release commit. Only when every
      package is on `latest` does the job also push `v<version>` at that same commit and report
      `published=true` with the full set. Otherwise it reports `published=false`, exits 1, and no
      GitHub Release is created. A partial train is on npm only under the staging tag, so
      `npm i @comvi/<pkg>` keeps resolving to the previous release.
- [ ] **To finish a partial or failed publish,** use "Re-run failed jobs" on the `publish` job. Do
      not start a fresh workflow run. Once every version is on npm, a fresh run's `pack` finds
      nothing pending and stops. After a partial publish it packs a new candidate from the current
      commit, and the `publish` step refuses it before publishing or promoting anything when the
      versions already on npm are tagged at the older commit, or when they hold neither the new
      candidate's staging tag nor its bytes (see below). The re-run
      skips what npm has, publishes the rest, moves `latest` for every package not yet on it
      (including after a crash between publishing and promotion), and pushes any missing tag,
      including the tag of a version an earlier run published but never tagged. **The candidate's
      bytes are its identity.** Before it moves `latest` or `next`, and before it creates or pushes
      any git tag, the job compares npm's `dist.integrity` of every candidate on npm with the
      sha512 of the candidate's own tarball, whether this run published the version, skipped it,
      had its `npm publish` refused because the version exists, or found the whole set already on
      npm. Any mismatch, or an integrity npm does not show, refuses everything: `published=false`,
      exit 1, and a message naming each package with the expected and the found integrity. This
      holds with and without git tags, so it covers the RC job, and it catches a run whose first
      look at npm was stale. Identical bytes always pass, so a retry after the staging tag was
      removed still reaches the git-tag checks and reports the full set. Before publishing, a
      cheaper check runs too: every version already on npm must carry the current candidate's
      staging tag or, without it, the candidate's bytes, or nothing is published. It names the
      staging tag and the integrity it expected and found. Passing it authorises nothing. The
      recovery from a refusal is "Re-run failed jobs" on the run that published those versions,
      since only that run has the same candidate. If the versions on npm mix two candidates, no run
      can finish them: release a new version. An existing tag at a different commit
      stops the job with both SHAs: decide by hand, and never move a tag that names released bytes.
      Promotion never moves a dist-tag backwards. If `latest` (or `next`) already names a newer
      version of any package, for example on a stale re-run of 0.5.0 after 0.5.1 shipped, the job
      names both versions, moves nothing and exits 1. A version this run published that npm does not
      show yet is asked again every 15 seconds until 10 minutes after npm accepted it, before it
      counts as `MISSING`: npm showed `@comvi/react@0.6.0` about 4 minutes after accepting it.
      `COMVI_PUBLISH_VISIBLE_POLL_MS` and `COMVI_PUBLISH_VISIBLE_WAIT_MS` set the two times. An
      `npm view` that hangs is killed when the wait runs out, but never sooner than
      `COMVI_PUBLISH_READ_TIMEOUT_MS` (30 seconds). A wait setting that is not a positive whole
      number of milliseconds stops the job before anything is published. An integrity npm does not
      show yet is asked again with backoff, for about 30 seconds, before it counts as `none`.
- [ ] `.github/scripts/create-combined-release.mjs` then creates the combined GitHub Release from
      the candidate tarballs. It refuses unless `v<version>` exists at the checked-out commit and
      the published set is everything `SHA256SUMS` lists. It passes `--verify-tag` to
      `gh release create`, so the tag is never created from the default branch's newer head. The
      tag is the release train's version; independently versioned packages appear in the notes and in
      `manifest.json` at their own version. If that step fails, npm is already live: re-run the
      `publish` job, which reconciles everything and reaches the release step again. If an earlier
      attempt created the release but failed to upload the archive, the step finds the release with
      `gh release view` and re-uploads the archive with `gh release upload --clobber` instead of
      failing on "already exists". The release notes of the existing release are kept. The notes
      are built to stay under 100,000 characters, because GitHub rejects a body above 125,000:
      `.github/release-notes/<version>.md` comes first when it exists (it must not contain an HTML
      comment, anywhere: the `pack` job fails on any `<!--`; to show one in a code sample, write
      `&lt;!--` inside `<pre><code>`), then one section per package
      from its CHANGELOG, and a section that does not fit its share is cut at a line and ends with
      a link to that package's `CHANGELOG.md` at the release tag. To read the notes beforehand, run
      the script with `COMVI_RELEASE_DRY_RUN=1` and `COMVI_RELEASE_BODY_FILE=<path>`. The
      archive is reproducible for a given Node build, so a re-upload from the same runner setup
      does not change the bytes of the asset: entries in a fixed order, owner 0, fixed modes, every
      time and `manifest.json`'s `generatedAt` taken from the release commit, and no gzip
      timestamp. The gzip stream comes from Node's bundled zlib, so if `setup-node` resolves a
      different Node patch release between the first attempt and a re-run, the archive bytes can
      still differ; the tarballs inside and their `SHA256SUMS` cannot. By hand, from
      the release commit with the tags fetched, run it with `PUBLISHED_PACKAGES=<the full set>` and
      `COMVI_RELEASE_TARBALLS_DIR=<the downloaded candidate>`.

## 4. The browser extension

The extension works with exactly one editor version. The `@comvi/editor` version of the workspace
it is built from is baked into the build (`apps/chrome-extension/vite.config.ts`), and on **Enable
editor** the site's core loads
`https://cdn.jsdelivr.net/npm/@comvi/editor@<that version>/dist/standalone.iife.js`. An editor fix
reaches users only with an extension release. jsDelivr caches an exact version permanently, and its
purge does not affect exact-version links, so the release workflow asks jsDelivr for nothing
(`scripts/release-workflow.test.mjs` holds that, and that the extension never asks for an alias).

The extension drives only a site whose core exposes the protocol-2 handle (`x.p === 2`); the entry
the 0.7.1 core puts on the page has no handle. Building, checking and releasing it are three
separate steps, and the check needs the editor version on npm.

### Build

- [ ] Build from a versioned tree. For GA: the merge of the release PR, whose
      `packages/editor/package.json` holds the version being released. For a candidate: a clean
      checkout of the candidate's commit, then `node scripts/rc-version.mjs --rc <N>` (working tree
      only, never committed), since the committed tree holds the previous release's version.
- [ ] One build serves one platform: `VITE_COMVI_API_BASE_URL` is baked into the code and into
      `host_permissions`, and every build fails without it. For production, in
      `apps/chrome-extension`: `VITE_COMVI_API_BASE_URL=https://api.comvi.io pnpm zip`. It builds,
      runs the artifact test for that origin and writes `comvi-extension.zip`. For another
      platform (staging): `VITE_COMVI_API_BASE_URL=<origin> pnpm build`, and use `dist/`
      unpacked; the `zip` script checks the production origin only.

### Check

- [ ] The artifact test, for the build's origin:
      `COMVI_EXPECT_API_ORIGIN=<origin> pnpm --filter @comvi/chrome-extension exec vitest run src/__tests__/artifacts.test.ts`.
      It fails if the baked editor version is not the workspace one, if `host_permissions` is not
      exactly that origin, or if `dist/` holds an editor bundle or anything that could load a
      remote script. `pnpm zip` has run it for production.
- [ ] jsDelivr serves the published editor, byte for byte. Possible only once that version is on
      npm. The two lines must be equal:

  ```sh
  curl -fsS https://cdn.jsdelivr.net/npm/@comvi/editor@<version>/dist/standalone.iife.js | shasum -a 256
  npm pack @comvi/editor@<version> && tar -xOzf comvi-editor-<version>.tgz package/dist/standalone.iife.js | shasum -a 256
  ```

- [ ] In Chrome: load the build unpacked (`chrome://extensions`, Developer mode; for the zip, its
      unzipped contents), open a site on the same core version that uses the build's platform,
      press **Enable editor**, and check that the editor starts and a saved translation reaches
      the platform.
- [ ] Record `shasum -a 256 comvi-extension.zip` of the zip that passed.

### Release

- [ ] Before the upload, `shasum -a 256` of the file being uploaded equals the recorded one.
- [ ] Upload it in the Chrome Web Store dashboard. Each upload needs a larger `version` in
      `manifest.json` than the store's current one, and that version is one to four
      dot-separated integers: a candidate's `0.8.0-rc.N` is not one.
- [ ] The store publishes after its review: at once, or, with **Defer publish**, when the owner
      publishes it, within 30 days of the review.
- [ ] Install the extension from the store and run the editor scenario on a 0.8 site against
      the production platform.

### Store and npm: the order

Whatever the order, the store's extension and the sites move together. Once the store publishes
this extension, sites on 0.5 to 0.7 lose in-context editing, since the extension does not drive
them; until it does, the store's previous extension does not load the editor on 0.8 sites.

**OPEN: the order of the Chrome Web Store and npm, and how current users are told, is the owner's
decision, not made yet.** This checklist states no order until it is. The options:

- **a.** npm publish, then the check, the upload, and the store's publication. The zip is checked
  before it is uploaded. Between npm and the store's publication the editor does not work on 0.8
  sites, and if the store rejects the build, 0.8.0 is `latest` without a working editor.
- **b.** Upload before npm with **Defer publish**, and publish in the store after the npm and
  jsDelivr checks. The review is over before GA. The uploaded zip cannot be checked in a browser
  before the upload, because its editor version is not on npm yet.
- **c.** A build with the 0.8.0 editor in the store before npm is not possible: the file it asks
  for does not exist yet.
- **d.** Before GA, upload a production build of the last `rc.N`, whose editor is on npm and
  jsDelivr and stays there. The zip is checked end to end before the upload, and the review is
  over before GA. Sites on 0.5 to 0.7 lose editing earlier, before GA; a new `rc.N` after the
  upload means a new upload; and the store keeps a build with a candidate editor until the next
  extension release, because the build with the 0.8.0 editor needs a larger manifest version than
  the one uploaded.

Also to decide: where current users are told (the popup, the release notes, the store
description).

## 5. After GA

- [ ] **Retire the `next` dist-tag.** Release candidates publish under `--tag next` and nothing
      moves it afterwards, so `npm i @comvi/core@next` keeps resolving to the last candidate after
      GA ships. For every package a candidate published, either remove the tag or point it at the
      GA version:

  ```sh
  # inspect first
  npm dist-tag ls @comvi/core
  # then, per package
  npm dist-tag rm @comvi/<pkg> next
  ```

      The 10 published names are `cli`, `core`, `editor`, `next`, `nuxt`, `react`, `solid`,
      `svelte`, `vite-plugin`, `vue`.

- [ ] **Deprecate the names that left in 0.8**, with the owner's confirmation.
      `@comvi/plugin-fetch-loader` and `@comvi/plugin-locale-detector` left the monorepo
      (`@comvi/core/cdn` and `@comvi/core/plugins` replace them):
      `npm deprecate @comvi/plugin-fetch-loader "Moved into @comvi/core/cdn since 0.8.0"`, and
      `@comvi/plugin-locale-detector` → `@comvi/core/plugins` the same way.
      `@comvi/plugin-in-context-editor` was renamed (standalone only); deprecate it once
      `@comvi/editor` 0.8.0 is on npm:
      `npm deprecate @comvi/plugin-in-context-editor "Renamed to @comvi/editor since 0.8.0; loaded by the Comvi browser extension"`.

- [ ] Keep the post-release observation window.

## Known release-tooling gaps (recorded, not fixed)

- The RC jobs run the browser suite on the candidate but no unit tests, package-contract or size
  gate.
- **A partial train can only be finished by a candidate with the same bytes.** Every version on
  npm must hold the current candidate's bytes, so a fresh run whose build differs is refused before
  anything is promoted or tagged: in CI or by hand, with git tags or without, at a newer commit or
  at the same one. The recovery is "Re-run failed jobs" on the original run. GitHub keeps re-runs
  for about 30 days, and both candidate artifacts are kept for 30 days. Once that run can no
  longer be re-run, a fresh run is possible only if it rebuilds the same bytes. By hand, for GA,
  in this order:
  1. **Compare the bytes first.** Pack the candidate at the release commit and, for every stuck
     version, check that these two lines are equal. If any differ, stop here and bump the version:
     no run can finish this train.

     ```sh
     npm view <name>@<version> dist.integrity
     node -p "'sha512-' + require('node:crypto').createHash('sha512').update(require('node:fs').readFileSync('<tgz>')).digest('base64')"
     ```

  2. **Push the package git tag** `<name>@<version>` of every stuck version at the release commit.
  3. **Dispatch the fresh run** from that same commit.

  The fresh run applies two guards, in this order. The git-tag guard runs first: a fresh CI run,
  attempt `1`, refuses any version on npm that has no package git tag, and any package git tag at
  a commit other than the one it checked out. That is why step 2 comes before step 3. Byte
  identity then authorises the rest: if npm's `dist.integrity` of each stuck version equals the
  sha512 of the newly packed tarball, the run publishes what is missing, promotes and tags. No
  `npm dist-tag add` of the staging tag is needed, and after promotion the run removes every
  `release-*` dist-tag that names the promoted version, the older candidate's included. If the
  bytes differ after all, the run refuses and names both integrities. The RC job has no git tags,
  so for it only the byte check applies.

- **An integrity or staging-tag read can still be stale for longer than the retries.** Missing
  values are asked again with backoff for about 30 seconds, and a version missing its staging tag
  falls back to the byte check. A failed read is asked again the same way. If npm still shows no
  integrity after that, the job refuses with `found none` and says to re-run. It fails closed: nothing is promoted or tagged, and a re-run of the same run passes
  once npm catches up.
