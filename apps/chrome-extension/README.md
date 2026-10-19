# Comvi In-Context Editor — Chrome Extension

Browser extension that enables the Comvi in-context translation editor on any
site using [@comvi/core](https://www.npmjs.com/package/@comvi/core), without
requiring the host app to bundle the editor plugin.

The extension detects Comvi i18n on the page. When you press **Enable editor**,
it asks the page's own Comvi SDK to load the standalone editor runtime
([@comvi/plugin-in-context-editor](https://www.npmjs.com/package/@comvi/plugin-in-context-editor)),
and activates it through an authenticated proxy (see below).

## What the site needs

- `@comvi/core` 0.6.0 or newer, with `.use(devtools())` on the i18n instance.
  `devtools()` publishes the instance for the extension and installs the hook
  that loads the editor. Without it the popup says "Comvi i18n not detected";
  on an older SDK it says the site must upgrade. The `<script>` global build
  of `@comvi/core` (`ComviCore.I18n`) composes `devtools()` on its own.
- If the site sends a Content Security Policy: `https://cdn.jsdelivr.net` in
  `script-src`. The editor does not run yet on a site that enforces Trusted
  Types: a `default` policy whose `createScriptURL` accepts that URL lets the
  loader's `<script>` through, but the editor it brings in does not work there.
  `style-src` needs no change: the editor
  adopts a constructable stylesheet, which every Chrome version this extension
  supports provides.

A site that already carries the editor (its app bundles the standalone build)
is activated as it is, and nothing is loaded.

## How the editor reaches the page

The extension package contains no editor and no code that loads one. It does
not fetch, inject or evaluate remote code.

1. The detector (a content script in the page's MAIN world) reads the
   editor-loader hook that `devtools()` installed
   (`globalThis[Symbol.for("comvi.devtools.editorLoader")]`, see
   `contracts/chrome-extension-proxy.json` → `editorLoader`).
2. On **Enable editor** it calls the hook's `load()`. The site's SDK then adds
   one `<script>` for
   `https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js`
   (or the version the site pinned with `devtools({ editorVersion })`). Nothing
   is requested before that click.
3. When the editor is on the page, the detector activates it with the proxy
   transport.

`load()` is page code, so the detector treats it as hostile: it is called
under `try`/`catch` with a 12-second limit, the answer is read field by field,
and the detector never reads the hook's `url` or creates a script element. If
the editor cannot start, the popup names one reason and one remedy:

| Popup says                                               | Cause                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Comvi i18n not detected on this page                     | No instance composed `devtools()`                                        |
| Comvi i18n vX found, but it cannot load the editor       | `@comvi/core` older than 0.6.0                                           |
| This site's Content Security Policy blocked the editor   | `script-src` does not allow `https://cdn.jsdelivr.net`, or Trusted Types |
| The editor could not be downloaded from cdn.jsdelivr.net | Network, a filter, or a pinned version that does not exist               |
| The editor did not finish loading … in time              | The CDN did not answer in time                                           |
| cdn.jsdelivr.net answered, but …                         | The file served was not the editor                                       |
| This site pins the editor with an invalid version        | `devtools({ editorVersion })` is not an exact version like `0.6.0`       |

Every word of these messages is the extension's own, including the host. The
popup never shows a sentence the page wrote: a failure travels from the page as
a code from a fixed list, and anything else becomes "The editor could not start
on this page." The only page-reported strings the popup shows are the SDK and
editor versions, and only when they look like a version: three numbers and at
most one lowercase pre-release word with one number (`0.6.0`, `0.6.0-rc.1`), 32
characters at most. Any other value is not shown. An Enable that ends without
an active session always says so, in the popup's own words.

While the popup says the editor cannot start here, it asks the page again every
second, so a site that creates its i18n instance late moves to **Enable editor**
without the popup being reopened.

## Security model

**API keys never enter the page.** The page's MAIN world is shared with
arbitrary first- and third-party scripts, so nothing secret crosses that
boundary in either direction:

- The key is entered in the popup, validated by the **service worker** against
  the API, and only then persisted (per-origin, `chrome.storage.local`). Key
  custody is limited to **trusted extension contexts**: the service worker,
  which attaches it to proxied requests, and the popup, which shows the saved
  key. On startup the worker restricts `chrome.storage.local` to those
  contexts, so the extension's content scripts cannot read it. If the browser
  cannot apply that restriction, the worker handles no key at all. The key can be
  removed with the popup's "Forget key" button.
- The editor runtime is activated with a **proxy transport**: API requests
  (path + body only) travel over DOM events to the isolated-world bridge and on
  to the service worker, which attaches the `Authorization` header and performs
  the fetch. The target host is fixed at build time and mirrored into
  `host_permissions`. Every request must match an **exact route contract**
  (`src/shared/proxy.ts`): the eleven specific method+path calls the editor
  makes, with per-route query and body validation, byte-size limits, and — for
  export routes — a project id bound to the validated key. Anything else,
  including every unknown future API route, is rejected locally without a
  network request.
- Sessions are **fail-closed and two-phase**: entering a key creates only a
  short-lived _pending_ record after the key validates against the API and the
  tab still shows the same canonical origin (https, or http on exact loopback
  hosts only). It becomes _active_ — and requests start flowing — only when the
  bridge acknowledges activation with a single-use nonce that never enters the
  page. Activation failure, timeout, navigation, tab close, disable and
  "Forget key" all revoke the session; requests are additionally bound to the
  acknowledging document and the tab's navigation generation.
- A minimal detector and isolated-world bridge run on `<all_urls>` so the
  toolbar icon can identify Comvi-enabled pages before the popup opens. They
  receive no API key and hold no proxy authority. The editor runtime and an
  authenticated session are still created only after explicit activation in
  the popup.
- Context collection (page origin, translation keys, on-screen layout hints)
  is sent only to **your own** Comvi project. It follows the site's Comvi i18n
  `collectContext` option, which is on by default; set `collectContext: false`
  in the site's i18n configuration to turn it off. The editor reports the
  effective setting when it activates, and the service worker opens the
  telemetry routes for that session only if the report says `true`. The report
  comes from the page's MAIN world, so the setting is **advisory**: it is
  honoured for an honest site, but it is not a security boundary (see below).

**Residual risk, by design:** DOM events in the MAIN world are forgeable, so
while a session is _active_ on a tab, scripts on that page can invoke the same
proxy channel — meaning they can perform exactly the editor's own operations
(read project locales/translations, save or delete translation keys, and submit
context telemetry for their own origin) against the project of the validated
key. The `collectContext: false` opt-out does not stop the telemetry part: a
hostile page can answer the activation itself and report `collectContext: true`,
because the single-use nonce proves that you started the activation, not what
the page reports. They cannot reach any other API route, another project's
export, telemetry for another origin, or the key itself. Only enable the editor on sites you operate or trust, and prefer keys
scoped to a single project with the minimum required permissions. A hostile
page can also fake the "Comvi detected" status in the popup and the activation
acknowledgement — both are treated as UI/readiness signals only and grant no
authority beyond the session the user explicitly opened.

The editor-loader hook does not widen this. A hostile page can replace the
hook, answer that the editor loaded and present its own `ComviInContextEditor`;
that fake then receives the proxy transport, which is the same substituted-editor
case as above: the editor's own routes, the validated key's project, an active
session the user opened. The extension never loads a URL the page names, and the
key, the single-use nonce and the route contract stay in the service worker and
the isolated world.

## Testing

```bash
pnpm typecheck
pnpm test        # vitest — route contract, sanitizers, SW session/proxy integration
pnpm verify      # typecheck + build + full suite incl. dist artifact checks + audit
pnpm test:e2e    # Gate E: the built extension in Chromium, see gate-e/README.md
```

The artifact checks fail if `dist/` contains an editor bundle or anything that
could load a remote script. Gate E runs the real built `@comvi/core` in the
page and answers its jsDelivr request with the locally built editor through
Playwright route interception, so no test touches the network. Build both
first: `pnpm exec turbo run build --filter @comvi/plugin-in-context-editor`.

## Development

```bash
pnpm install
cp env.example .env
pnpm build       # produces dist/
pnpm dev         # rebuilds on change
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode).

### Environment

- `VITE_COMVI_API_BASE_URL` — origin for the Comvi platform API
  (`https://api.comvi.io` for production). **Required**: every build throws without it,
  `pnpm zip` included, because the manifest must grant exactly that origin.

## Packaging

```bash
VITE_COMVI_API_BASE_URL=https://api.comvi.io pnpm zip   # produces comvi-extension.zip in apps/chrome-extension/
```

Upload `comvi-extension.zip` to the Chrome Web Store dashboard.

The extension is versioned by hand in `manifest.json` and `package.json`
(changesets ignore it).

### Release order

Extension 0.6.0 cannot load the editor onto a site whose SDK is older than
0.6.0, though it activates an editor the site bundles itself at any version. By
default it loads whatever jsDelivr serves as `@latest`, unless the site pins a
version with `devtools({ editorVersion })`. So:

1. Publish the npm packages first, and check that
   `https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js`
   answers with the new version (`x-jsd-version`).
2. Only then submit the extension to the Chrome Web Store. During the review
   the store copy stays on the previous version, which bundles its own editor
   and keeps working against the new SDK.

No new permission is requested: `permissions` stay `storage`, `activeTab`,
`scripting`, and `host_permissions` stays the API origin.
