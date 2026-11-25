# Comvi In-Context Editor — Chrome Extension

Browser extension that enables the Comvi in-context translation editor on any
site using [@comvi/core](https://www.npmjs.com/package/@comvi/core), without
requiring the host app to bundle the editor.

The extension detects Comvi i18n on the page. When you press **Enable editor**,
it asks the page's own Comvi core to load the editor
([@comvi/editor](https://www.npmjs.com/package/@comvi/editor)), and activates it
through an authenticated proxy (see below).

## What the site needs

- `@comvi/core` 0.8 or newer, with `plugins: [devtools()]` on the i18n instance
  (`import { devtools } from "@comvi/core/devtools"`). `devtools()` puts the
  instance on `window.__COMVI__` with the handle the extension drives (protocol
  2). Without it the popup says "Comvi i18n not detected".
- If the site sends a Content Security Policy: `https://cdn.jsdelivr.net` in
  `script-src`. A site that enforces Trusted Types also needs a `default`
  policy whose `createScriptURL` accepts that script URL, and `vue` in its
  `trusted-types` directive, the policy the editor's Vue runtime creates.
  `style-src` needs no change: the editor adopts a constructable stylesheet, which every Chrome version this extension
  supports provides.

A site on an older Comvi (0.5–0.7) or on a protocol this extension does not know
is not driven at all: the popup says what to do, and Enable is not offered.

Nothing else: no editor package and no API key in the app. Until **Enable
editor**, the page carries no marker of the editor; **Disable** re-renders the
app's output without markers, and a string the app kept elsewhere (a title set
once, a value copied into an input) keeps its markers until the app renders it
again. Gate E checks marking and live edit on React, Vue, Solid and Svelte apps
and on Next.js and Nuxt server renders (`gate-e/README.md`). On Next.js, text
rendered only by a Server Component is not editable in context: the browser
never renders it again, so it carries no marker and a click on it opens
nothing; change it in the Comvi platform. The editor's limits are listed on
[Limitations](https://comvi.io/docs/i18n/limitations#editor-server-components).

## How the editor reaches the page

The extension package contains no editor and no code that loads one. It does
not fetch, inject or evaluate remote code.

1. The detector (a content script in the page's MAIN world) reads
   `window.__COMVI__` as a plain array (`contracts/chrome-extension-proxy.json`
   → `discovery`, `handle`). It drives only an entry with an own `i` object and
   an own `x` object with `x.p === 2` and `x.kind === "comvi"`. It reads own data
   properties only, runs no getter of the page, and never replaces or changes
   the global.
2. On **Enable editor** it calls `x.load(version)` on the first compatible
   handle. `version` is the exact `@comvi/editor` version this extension was
   built with: a constant taken from the workspace at build time, checked by the
   artifact test. Never `latest`, never a lookup. The site's core then adds one
   `<script>` for
   `https://cdn.jsdelivr.net/npm/@comvi/editor@<version>/dist/standalone.iife.js`.
   Nothing is requested before that click.
3. When the editor is on the page, the detector activates it with the proxy
   transport.

Everything around `x.load()` is the extension's: one load in flight however
often Enable is pressed, an editor already on the page is reused, a 12-second
limit, a retry after a failure (a failed load is not kept), and the reason when
it fails. The reason comes from a `securitypolicyviolation` listener registered
before `x.load()` (a `script-src` block, a Trusted Types refusal) or from how the
load ended. If the editor cannot start, the popup names one reason and one
remedy:

The popup names no CDN host: its CSP remedy points to comvi.io/docs/i18n/troubleshooting,
which does, so the package carries no script host for the MV3 review to find.

| Popup says                                                        | Cause                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Comvi i18n not detected on this page                              | No instance composed `devtools()`                                           |
| Comvi i18n vX found, but it is older than 0.8                     | `@comvi/core` 0.5–0.7 (`{ v, i }` entries, the v1 registry or the 0.7 hook) |
| This site runs a newer Comvi i18n than this extension supports    | A handle with `x.p !== 2` or another `kind`: update the extension           |
| This site's Content Security Policy blocked the editor            | `script-src` does not allow `https://cdn.jsdelivr.net`                      |
| This site enforces Trusted Types, and no policy let the editor's… | No Trusted Types `default` policy accepts the editor URL                    |
| The editor could not be downloaded from its CDN                   | Network, a filter, or a 404                                                 |
| The editor did not finish loading … in time                       | The CDN did not answer within 12 seconds                                    |
| The editor's CDN answered, but …                                  | The script ran and left no editor                                           |
| The editor on this page is not the version this extension works…  | An editor of another version is on the page                                 |

On a page of an older or unknown protocol nothing is called on the page's
entries or on the 0.7 loader slot, nothing is loaded, and nothing is added: no
script, no global, no listener on the entries. The content scripts themselves
declare no globals (each runs in a function scope of its own), and the
re-injection guard is an event the detector answers, not a property on
`window`.

Every word of these messages is the extension's own, including the host. The
popup never shows a sentence the page wrote: a failure travels from the page as
a code from a fixed list, and anything else becomes "The editor could not start
on this page." The only page-reported strings the popup shows are the SDK and
editor versions, and only when they look like a version: three numbers and at
most one lowercase pre-release word with one number (`0.8.0`, `0.8.0-rc.1`), 32
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
- **Context collection is off in this release.** The editor sends no usage
  context, and no session opens the context routes (`/v1/context/handshake`,
  `/v1/context/usages`): the service worker refuses them before any network
  request, whatever the page's activation result claims. Local discovery,
  marking, editing and saving are unaffected. Where a control for collection
  would live, and whether collection returns, is an open product question.

**Residual risk, by design:** DOM events in the MAIN world are forgeable, so
while a session is _active_ on a tab, scripts on that page can invoke the same
proxy channel — meaning they can perform exactly the editor's own operations
(read project locales/translations, save or delete translation keys) against
the project of the validated key. A hostile page can answer the activation
itself, because the single-use nonce proves that you started the activation,
not what the page reports; whatever it claims, the session opens no context
route. They cannot reach any other API route, another project's export, the
context routes, or the key itself. Only enable the editor on sites you operate or trust, and prefer keys
scoped to a single project with the minimum required permissions. A hostile
page can also fake the "Comvi detected" status in the popup and the activation
acknowledgement — both are treated as UI/readiness signals only and grant no
authority beyond the session the user explicitly opened. The detector's re-injection
guard is a cancelable probe event the page sees too: a page can suppress it, so
the detector does not install (no editor on that page), or swallow it, so the
popup's re-injection installs a second detector. Two detectors still start one
editor session (the editor refuses a second activation, and only the first
answer carries the activation's nonce) and Disable stops it; the effect stays on
that page's own tab. Nothing on an ordinary page cancels or swallows the probe:
an extension update or reload, the back/forward cache and listeners that do not
call `preventDefault()` or `stopImmediatePropagation()` on it leave one detector.

The handle does not widen this. A hostile page can push its own protocol
2-shaped entry onto `window.__COMVI__`, answer `x.load()` itself and present its
own `ComviInContextEditor`; that fake then receives the proxy transport, which is
the same substituted-editor case as above: the editor's own routes, the
validated key's project, an active session the user opened. The extension never
loads a URL the page names and never creates a script element, and the key, the
single-use nonce and the route contract stay in the service worker and the
isolated world.

## Testing

```bash
pnpm typecheck
pnpm test        # vitest — route contract, sanitizers, SW session/proxy integration
pnpm verify      # typecheck + build + full suite incl. dist artifact checks + audit
pnpm test:e2e    # Gate E: the built extension in Chromium, see gate-e/README.md
```

The artifact checks fail if `dist/` contains an editor bundle or anything that
could load a remote script, if a content script declares a global, or if the
detector asks for any editor version but the workspace `@comvi/editor` one.
Gate E runs the real built `@comvi/core` modules in the page and answers its
jsDelivr request with the locally built editor through Playwright route
interception, so no test touches the network. Build both first:
`pnpm --filter @comvi/core --filter @comvi/editor build`.

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

The extension works with exactly one editor version: the workspace
`@comvi/editor` version at build time, so an editor fix reaches users with an
extension release. Build the zip from the versioned commit (after
`changeset version`), and submit it only once that `@comvi/editor` version is on
npm and
`https://cdn.jsdelivr.net/npm/@comvi/editor@<version>/dist/standalone.iife.js`
answers: before that, the extension asks for a file that does not exist.

The order of the Chrome Web Store and npm releases for 0.8, and how current
users of the 0.6 extension and of 0.7 sites move, is an open owner decision,
made before the 0.8 release (`RELEASING.md`). The store's 0.6 extension cannot
load the editor onto a 0.8 site, and this extension does not drive a 0.7 site.

No new permission is requested: `permissions` stay `storage`, `activeTab`,
`scripting`, and `host_permissions` stays the API origin.
