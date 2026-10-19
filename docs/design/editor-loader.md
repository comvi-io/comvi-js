# The site loads the in-context editor; the browser extension only asks

Status: accepted · Date: 2026-10-11 · Owner decision(s): COM-140 — `@latest` by default with an
hourly salt, a 10 s hook timeout, the CDN global always `@latest`, 11.10.2026

## Context

Until 0.6.0 the Chrome extension carried a copy of the standalone editor and injected it with
`chrome.scripting`, so every editor fix needed a new store submission and a review, and the copy on
a translator's machine lagged the SDK on the site. Manifest V3 forbids an extension from loading
remote code itself, which rules out the extension fetching the editor from a CDN. The site's own
page is under no such rule: a `<script>` the page inserts is first-party code, and the page already
composes `devtools()` when it wants the extension to find it. Three constraints: the extension
ships no editor and loads no remote code; a site that never asked is untouched (no bytes, no
network); the API key stays in the extension.

## Decision

- **`devtools()` installs a page-level editor loader** next to the discovery queue, in
  `globalThis[Symbol.for("comvi.devtools.editorLoader")]`: a slot `{ protocol, sdkVersion,
editorVersion, url, load() }` (`contracts/chrome-extension-proxy.json`, `editorLoader`). A base
  instance installs nothing; an app that never calls `devtools()` is invisible to the extension and
  carries none of this code. Two things compose `devtools()` on the app's behalf and so install
  the loader without that call: the `<script>` global build of `@comvi/core` (`ComviCore.I18n`,
  `ComviCore.createI18n`; `core/full.ts`), where `exposeGlobal: false` stops the install but not
  the bytes, and `inContextEditor()` in a development build. Neither has an `editorVersion`; both
  load `latest`.
  Every ESM entry, the bindings' `createI18n` included, builds the base instance.
- **The extension calls `load()`, and nothing else.** The detector reads the slot, and on **Enable
  editor** calls `load()` under `try`/`catch` with its own 12 s budget above the hook's 10 s. It
  never reads `url` to load it and never creates a script element. The site's SDK inserts one
  `<script crossorigin="anonymous">` from
  `https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@<version>/dist/standalone.iife.js`.
  Nothing is requested before that click.
- **`latest` by default, an exact version on request.** `devtools({ editorVersion: "0.6.0" })`
  pins; an exact `major.minor.patch`, optionally with a prerelease suffix such as `0.6.0-rc.1`, is
  accepted. Any other explicit value FAILS CLOSED: the slot is installed with the version
  `"invalid"` and no URL, `load()` requests nothing and answers `invalid-editor-version`, which
  the popup words as "must be an exact version like 1.2.3", and development builds also warn. It
  never falls back to `latest`, so a typo cannot silently ship whatever is newest. A `latest` URL
  carries `?comvi=<hour bucket>` so the browser's 7-day cache for a version alias is bounded to an
  hour; an exact version is immutable and takes no query. The first instance on a page decides,
  and the UMD composite (`core/full.ts`) always loads `latest`.
- **The slot is page-wide and protocol-versioned.** Every copy of core on the page meets the same
  slot and replaces it only with a strictly newer protocol; the load promise lives under a second
  key, so a replacing core inherits a pending or finished load instead of inserting a second
  script. Compatibility is two-directional: fields released under a protocol are never removed or
  retyped, and the editor accepts any protocol ≥ 1 and ignores fields it does not know.
- **One result for every outcome.** `load()` resolves, never rejects, with `{ ok, url, sdkVersion,
protocol }` plus `editorVersion` on success or a `code` from a fixed list on failure
  (`csp-blocked`, `load-error`, `timeout`, `no-global`). A failure is not cached, so a retry after
  the site fixed its CSP starts fresh. The popup maps each code to a sentence of its own and never
  renders a string the page wrote, except a version that looks like one.

## Consequences

- **Recipes change.** The "gate it out of production" shape becomes
  `(editorEnabled ? base.use(inContextEditor()) : base).use(devtools())`: the plugin's production
  entry is empty, so a site that gated `devtools()` with it was invisible to the extension exactly
  where the extension is the only way to edit. `@comvi/next` no longer composes discovery on its
  own; `.use(devtools())` on the `createNextI18n` result is the one line a Next app adds.
- **Bytes move from the extension to the site.** `devtools()` costs about 1.2 kB min+gz over the
  base instance, of which about 0.7 kB is the loader, new in 0.6.0, and the rest the discovery
  that 0.5.0 already shipped (`scripts/size-budgets.md`, 2026-10-12 and 2026-10-14). An ESM app
  that does not call `devtools()` carries none of it; the global build carries it always. The extension's `dist/` carries no editor and its
  artifact test fails if one appears.

  | Row (`scripts/size-budgets.json`)         | min+gz |
  | ----------------------------------------- | ------ |
  | `core-base`                               | 5608 B |
  | `core-base-devtools` (`.use(devtools())`) | 6872 B |

- **A site with a Content Security Policy must allow `https://cdn.jsdelivr.net` in `script-src`**,
  and on a site that enforces Trusted Types a `default` policy whose `createScriptURL` accepts that
  URL lets the loader through, since it assigns `script.src` as a plain string; the editor UI itself
  does not run under Trusted Types yet (`plugin-in-context-editor` README). No `style-src` change where
  the browser supports it: the editor applies its styles through a constructable stylesheet
  adopted by its shadow root, and falls back to an inline `<style>` element where
  `adoptedStyleSheets` is missing or the sheet is not adopted (`shadowDom.ts`).
- **Release order is fixed.** Extension 0.6.0 cannot start the editor on a site whose SDK is older
  than 0.6.0, and it loads whatever jsDelivr serves as `latest`, so the npm packages publish first,
  jsDelivr's `latest` is checked to serve the new version, and the store submission follows.
- **The trust boundary does not widen.** `load()` is page code called by extension code. A hostile
  page can replace the slot, answer that the editor loaded and present its own
  `ComviInContextEditor`; that fake then receives the proxy transport, which is the same
  substituted-editor case the extension README already documents: the editor's own routes, the
  validated key's project, an active session the user opened. The extension never loads a URL the
  page names, and the key, the single-use nonce and the route contract stay in the service worker
  and the isolated world.
- **Accepted limits** (from the code comment in `core/devtools.ts`): both keys are the page's own
  globals, and a page that rewrites them only breaks its own editor. A foreign slot of a newer
  protocol is deferred to as it is; a promise planted under the load key is returned as it is, with
  no timeout wrapped around it, because the extension's own activation timeout bounds it; a page
  that deletes the load key between two calls gets a second `<script>`.

## Alternatives rejected

- **Keep bundling the editor in the extension** — every editor fix waits for a store review, the
  translator's copy lags the site's SDK, and the `scripting` injection of a 135 kB file on every
  Enable is what the loader replaces.
- **An exact version as the default** — the site would then pin the editor to whatever
  `@comvi/core` it was built with, and an editor fix would again wait for every site to rebuild.
  With `latest`, a fix reaches the page without a rebuild, in two steps. jsDelivr's edge keeps the
  alias until the purge the release workflow requests succeeds; without one, for 12 hours by the
  header it sends today (`s-maxage=43200`, observed 2026-10-12), while jsDelivr's README documents
  up to 7 days for a version alias. The hourly salt then bounds the browser's own copy to an hour.
  So within the hour after a successful purge, and 13 hours by today's header without one. A site
  that wants the pin has `editorVersion`.
- **Comvi's own CDN** — a second origin to run, purge and keep in every site's CSP, for a file npm
  already publishes. jsDelivr serves the published tarball, caches an exact version indefinitely
  and takes a purge call for the alias.
- **A DOM-event protocol between the extension and the page** — events are the channel the proxy
  transport already uses, and they are forgeable in the MAIN world; a slot the extension reads and
  calls is one function with one result shape, read field by field, and the detector already runs
  in that world.
- **The extension creating the `<script>` from the slot's `url`** — then the extension loads a URL
  the page named: remote code under the extension's own identity, which Manifest V3 forbids. The
  site inserting its own script is first-party code on the page.

## Where it lives

- `installEditorLoader`, `loadedEditor`, `loadResult`, the `EDITOR_CDN_HOST` / `LOADER_KEY` /
  `LOAD_KEY` constants and `DevtoolsOptions.editorVersion` — `packages/core/src/core/devtools.ts`;
  `EditorLoaderSlot`, `EditorLoadResult`, `EditorLoadFailureCode` — `packages/core/src/types.ts`
- the `editorLoader` contract — `contracts/chrome-extension-proxy.json`; the hand-written
  protocol-1 fixture —
  `packages/plugin-in-context-editor/tests/fixtures/editor-loader-hooks/protocol-1.js`
- `getStatus().hook` and the standalone `version` —
  `packages/plugin-in-context-editor/src/standalone.ts`; the constructable stylesheet —
  `.../src/utils/shadowDom.ts`
- the detector's `load()` call and `EDITOR_LOAD_BUDGET_MS` —
  `apps/chrome-extension/src/content/detector.ts`;
  the reason texts and `EDITOR_CDN_HOST` — `.../src/popup/popup.ts`
- the release order — `apps/chrome-extension/README.md`, "Release order"

## Related

- [composition.md](composition.md) — `devtools()` is one installer among the capabilities, and a
  base instance carries none of them.
- `apps/chrome-extension/README.md` — the security model this record's trust-boundary statement
  is copied from.
