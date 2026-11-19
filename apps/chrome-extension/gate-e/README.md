# Gate E — adversarial smoke test

The final release gate: on a deliberately hostile page, try to forge
detection/activation, call unrelated/destructive routes, exceed rate/body
limits, and keep going after "Forget key". **Every attempt must fail without
an authenticated network request reaching the API.**

The release path is automated with Playwright, bundled Chromium, an unpacked
MV3 build, and the real toolbar popup target exposed through local CDP. It
talks to a **local mock API**, so no real key or production host is involved.
The mock is also the ground truth for egress: every `/v1/*` request the service
worker makes is logged with its `Authorization` header.

## One-time setup

```bash
# From the repository root: turbo builds every workspace package the extension
# declares first (core, the editor, the bindings, next, nuxt — `^build`), then the
# Gate E extension build, the framework rows' apps, and runs the gate:
pnpm exec playwright install chromium   # once (firefox webkit for test:layout-engines)
pnpm extension:gate-e
```

`test:e2e` (what `extension:gate-e` runs after the workspace builds) builds
`dist-gate-e/`, builds the framework rows' apps (`gate-e/frameworks/build.mjs`),
starts the mock server and the two SSR servers, loads the unpacked extension into
a clean persistent Chromium context, drives the real action popup, and saves
traces/screenshots on failure.

The extension carries no editor: the page's own core loads it from jsDelivr
when the popup asks. Core 0.8 builds no global bundle, so the mock server
serves the built ES modules of `packages/core/dist` under `/core/` (and again
under `/core2/`: the same files at other URLs are a second copy of core, with
module instances of their own) to small pages in `fixtures/`, which import them.
`mockEditorCdn` in `helpers.ts` answers the core's request for
`https://cdn.jsdelivr.net/npm/@comvi/editor@<exact>/dist/standalone.iife.js` with
the locally built `packages/editor/dist/standalone.iife.js` through Playwright
route interception, or with a chosen failure (`unreachable`, `not-found`,
`never`, `throws`, `no-global`; switchable mid-test). Any other CDN URL is
refused. The gate tests this commit's editor and never touches the network;
neither core nor the extension has a test seam for it.

The mock API is a small platform: one project whose keys live in a store.
`GET /v1/keys/:ns/:key` reads it, `PUT /v1/keys` writes it (or fails, after
`/__config?failSaves=n`), and `/catalog/:locale/:ns.json` serves it as nested
JSON, the way a CDN serves a published catalog. `/__log` lists every request
that reached the API (method, path, Authorization, body); `/__reset` restores
the seed.

## Real-platform system gate

Run the cross-repository persistence scenario from the sibling platform repo:

```bash
cd ../../../platform
pnpm test:system
```

The orchestrator starts isolated Postgres/Redis and the real API, creates a
short-lived project API key, builds the current SDK editor bundle and
`dist-system/`, then verifies translation CRUD through
the MV3 boundary in Chromium (the context routes stay closed in this release). The key is generated inside the isolated run and
is never placed in the hostile page.

Programmatic `chrome.action.openPopup()` in headless Chromium does not reproduce
the physical toolbar gesture that grants `activeTab`. For this test only,
`dist-system/` receives an additional permission for the exact loopback fixture
origin. `vite.config.ts` rejects that override for the release `dist/` build,
whose artifact tests continue to require only the configured API origin.

## Automated coverage

The Playwright gate runs phases 1–5 of the hostile page without user input
(`security-boundary.spec.ts`):

1. forged activation and proxy calls without a session;
2. exact route/body/response/rate enforcement while active, the context routes
   closed (context collection is off in this release);
3. direct SDK deactivation and Forget-key revocation;
4. navigation while API-key validation is in flight;
5. popup closure while activation is pending.

`hostile-activation.spec.ts`: a page that answers the activation itself and
claims `collectContext: true` gets a session that stores no telemetry
permission, and every context route is refused before it reaches the API. A page
that pushes its own protocol 2-shaped entry ahead of core and answers `x.load()`
itself: a forged violation or rejection cannot make the popup recommend the
page's host, a forged failure sentence never reaches the popup, and a forged
success whose `load()` plants a fake `ComviInContextEditor` gives the fake the
editor's own routes for the validated project and nothing else (the residual
risk the extension README documents). The extension loads nothing, the page
never holds the key, and a replayed activation after Disable opens nothing.

The Comvi 0.8 site pages (`fixtures/app.js`: plain DOM, every `[data-k]` element
rendered by `t()` and re-rendered on every publish) carry the lot-8 checklist:

| Spec                | What must happen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `editing.spec.ts`   | Enable, Alt-click, change, save, the page shows it: the right key, namespace and locale reach the platform; a key of another namespace, a nested catalog key, a missing key, rich text; a fallback text edited in the page's locale; an API error shown, then a retry that saves; D6 (no partial catalog); D2 (a snapshot wins, other patches survive, the open form keeps its text, a client route is marked and editable); text copied from the marked page and pasted into the form is saved without its frames |
| `instances.spec.ts` | An instance that appears after the popup opened and one that joins an active session; several instances and two copies of core, each click editing its own; a destroyed instance; repeated Enable (one load, one frame, one set of listeners); Disable (no frame in new output, no editor DOM, the editor's listeners gone)                                                                                                                                                                                        |
| `loading.spec.ts`   | No request before Enable, then exactly one, for the exact version; CSP `script-src`, Trusted Types without and with a policy, `style-src 'self'`; unreachable, 404, a throwing script, no editor global (each followed by a retry that loads), a CDN that never answers; every incompatible shape (0.5–0.7 entry, v1 registry, 0.7 hook, `x.p: 3`, another `kind`) with proof that nothing was touched; the app keeps working after each failure                                                                   |
| `session.spec.ts`   | A whole session, a client navigation and a reload included: no request to `/v1/context/*`, and none asked for on the page side; the API key on no page surface (DOM with shadow roots, markers, console, every event of the channel, storage, URL)                                                                                                                                                                                                                                                                 |
| `layout.spec.ts`    | Marked output has the width, height, line count, overflow width and pixels of unmarked output: a long Latin sentence, Thai ending in ZWSP, Persian ending in ZWNJ, Arabic (also two messages joined inside one word), an ellipsis box, rich output, in Chromium with the extension. The numbers go to `test-results/**/marker-layout.json`                                                                                                                                                                         |

`extents.spec.ts` updates a rich translation the ordinary ways (a save, the
trailing text and closing frame rewritten in place, the closing side replaced)
in an element that also holds a plain string, and checks the result a user
sees: the bold part opens the rich key alone, the rest offers both keys once,
the key selector previews the text now on the page, and the highlight box is
that element's. `editing.spec.ts` also saves Portuguese against a platform that
spells it `pt-BR` while the app runs `pt-br`, and the other way round: the page
shows the saved text.

### The framework rows

`frameworks.spec.ts` runs the lot-8 checklist on apps that React, Vue, Solid and
Svelte render themselves (`gate-e/frameworks/<fw>/`, built in development mode by
`frameworks/build.mjs` with each framework's own Vite plugin from the workspace
bindings; the instance composes the real `cdn()` loader and `plugins: [devtools()]`).
`frameworks-ssr.spec.ts` runs it on production builds of a Next 15 App Router app
(`frameworks/next`, `@comvi/next`) and a Nuxt 4 app (`frameworks/nuxt`,
`@comvi/nuxt`), started by `frameworks/serve.mjs` and reached through the mock
server, which proxies Next's `/en`, `/de` and `/_next` and Nuxt's `/nuxt/` paths
unchanged: every page stays on `127.0.0.1:8791`, the one origin the Gate E build's
host permission names. The rows check `#A-title` (`t()`), `#A-common` (another
namespace), `#A-missing` (a missing key), `#A-rich` (rich `<T>`) and `#A-late`
(rendered after Disable):

- before Enable, no frame or tag character in the page's text or attributes;
- after Enable, each string carries its key and namespace, the rich message a pair
  around the parts the binding renders;
- an Alt-click on a plain string, on the bold part and on the text part of the rich
  message, and on a missing key opens that key;
- saves of another namespace's key, of the rich message (its new parts rendered by
  the framework) and of a missing key show on the page without a reload; no request
  body and nothing `x.read()` or `x.state()` hold carries a tag character;
- after Disable the rendered strings lose their frames and new output has none;
- no warning or error in the console from the page's first script to the end.

The SSR rows add: the server HTML (fetched raw, and every document, RSC payload and
JSON the app answered during the session) holds the rendered strings and no tag
character U+E0020–U+E007F; no console warning or error after hydration; the
server's own output (`test-results/ssr-<fw>.log`) carries no error, warning or
browser-API failure; after a client navigation the new page's strings are marked
and a save shows. Text rendered only by a Next.js Server Component (`#S-title`) is
not editable in context: the browser never renders it again, so it carries no frame
and a click on it opens nothing. After Disable a string the page wrote once by hand
(`#kept`, a copy of a marked title) keeps its frame; the app's own output has none.

A new row follows the same contract: render those ids, load catalogs with
`cdn(`/cdn`)` from the mock (`/cdn/<locale>.json`, `/cdn/<ns>/<locale>.json`), set
`document.body.dataset.booted`, and add the page to `SITE_PAGES` (or, for a server,
to `SSR_UPSTREAMS` and `webServer` in `playwright.config.ts`).

### Plain pages in three engines

`pnpm test:layout-engines` (`playwright.engines.config.ts`) runs, without the
extension, `no-session.spec.ts` (a page that composes `devtools()` and has no
editor session renders no frame or tag character, the framework rows' pages
included) and `layout-engines.spec.ts` (the layout cases marked by the editor's own
`dist/standalone.iife.js`, activated on the page directly), in Chromium, Firefox and
WebKit. CI runs both after Gate E.

- Chromium, the engine the extension runs in: marked output must measure identical
  to unmarked (boxes and pixels, Arabic included). Required.
- Firefox: measured identical too. An extra check of the format; it promises no
  support of the extension in Firefox.
- `layout-engines.spec.ts` is two tests. The first is required in every engine,
  WebKit included: the page loads, the editor marks every case, the control box
  (`{ markers: false }`) carries no frame and the marked box its frames, and the
  line count and the height are unchanged. The second compares width and pixels;
  only it is the expected failure in WebKit. The cases include a string ending in
  an emoji and one ending in a tag-sequence flag (identical in all three engines).
- WebKit: a known defect (owner decision 2026-11-19). During an editing session a
  frame changes the shaping of the neighbouring glyph and breaks Arabic joining
  (Arabic widens by about 7 px). WebKit is outside the editor's supported way of
  working; the width-and-pixels test is marked `test.fail` there, so it reports when WebKit
  stops failing and its measured values are never asserted as intended. Without an
  editor session WebKit renders no frame (`no-session.spec.ts`).

The numbers go to `test-results/**/marker-layout-<engine>.json`.

`navigation.spec.ts` runs with the back/forward cache enabled (Playwright
disables it by default). It navigates an active tab to `about:blank`, where no
content script runs, and requires the session and the `ON` badge to be gone.
Before navigating it also evaluates `chrome.storage.local.get` in the
extension's content-script world over CDP and requires it to be denied, so the
saved key stays with the worker and the popup. It then goes Back, checks that the cached document really was restored, and
requires that document to hold no authority, its editor runtime to be torn
down, and a new activation from the popup to succeed.

Phase 6 (same API key across two page origins) is covered deterministically by
the service-worker integration test `revokes sessions on other origins that
use the same API key`. Chromium's programmatic `openPopup()` does not grant
`activeTab` to a newly created second tab like a physical toolbar click does.

## Optional manual inspection

For visual debugging, build and serve the harness:

```bash
pnpm gate-e:build
pnpm gate-e:serve
```

Then load the extension once:

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `chrome-extension/dist-gate-e`.

## Manual run

Open <http://127.0.0.1:8791/> and:

1. **Phase 1** — click _Run Phase 1_. No session yet: every forged event and
   proxy attempt must be denied, egress log unchanged.
2. **Phase 2** — open the extension popup, paste **any** string as the key
   (the mock validates it), and click _Enable editor_. Then click _Run Phase 2_:
   the allowed route works, but the context routes remain closed;
   destructive/out-of-contract routes, wrong-project export,
   oversized bodies, and a request flood are all rejected —
   and none of the destructive routes appear in the mock log.
3. After Phase 2, run `ComviInContextEditor.deactivate()` in the console and
   then `gateE.checkSdkDeactivation()`, which proves that direct SDK teardown
   revokes authority. Re-enable the editor, click _Forget key_, then
   run **Phase 3**; the proxy must be denied again.
4. **Phase 4** makes the mock API hold the next key validation. Enable the
   editor (validation stays in flight), reload this page, click _Release the
   held key validation_, then _Check Phase 4_: the new document must have
   inherited no capability.
5. **Phase 5** holds the next validation the same way. Enable the editor,
   close the popup, release the validation, then _Check Phase 5_: no
   pending/active capability may survive.

Nothing in the harness waits on the wall clock: the automated spec sequences
each race on observed state (the mock reports a held validation, the worker's
session store, the popup's error line) instead of sleeps. 6. **Phase 6** is a two-tab credential-family check: open the harness as both
`http://127.0.0.1:8791` and `http://localhost:8791`, enable both with the
same mock key, Forget it in either popup, then run
`gateE.proxy("/v1/project/locales")` in both consoles. Both must be denied.

The page shows PASS/FAIL per check and an overall verdict. Results are also on
`window.__GATE_E_RESULTS__` / `window.__GATE_E_SUMMARY__` for tooling.

## What each phase proves

| Phase | Boundary claim                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | No proxy authority exists without a popup-created, activated session; forged detection/activation grant nothing.                                                                                                                                                                         |
| 2     | An active session is confined to the exact editor route contract, bound to the validated project, size/rate limited, and the context routes stay closed. Credentials never leave trusted extension contexts (no `/v1` request the page didn't authorize; page sends no `Authorization`). |
| 3     | "Forget key" revokes authority across the tab immediately.                                                                                                                                                                                                                               |
| 4     | Navigation during validation cannot authorize the replacement document or reuse its channel.                                                                                                                                                                                             |
| 5     | Popup teardown before confirmation revokes pending activation.                                                                                                                                                                                                                           |
| 6     | Forget removes every persisted credential/session sharing the API key across origins.                                                                                                                                                                                                    |

## Notes

- The mock listens on `127.0.0.1:8791`. If that port is busy, change `PORT` in
  `mock-api-server.mjs` and `VITE_COMVI_API_BASE_URL` in `.env.gate-e`, then
  rebuild.
- `dist-gate-e/` is a throwaway build wired to the mock — **never ship it**.
  The shippable build remains `pnpm build` → `dist/` (pinned to
  `https://api.comvi.io`).
