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
# 1. Build @comvi/core and the editor (the pages load both; the extension
#    build itself needs neither):
pnpm exec turbo run build --filter @comvi/plugin-in-context-editor

# 2. Install the browser once, then run the complete automated gate:
pnpm exec playwright install chromium
pnpm test:e2e
```

`test:e2e` builds `dist-gate-e/`, starts the mock server, loads the unpacked
extension into a clean persistent Chromium context, drives the real action
popup, and saves traces/screenshots on failure.

The extension carries no editor: the page's own Comvi SDK loads it from
jsDelivr when the popup asks. So every page here runs the real built
`@comvi/core` global (`/__core.js`), whose devtools capability installs the
editor-loader hook, and `serveEditorFromLocalBuild` in `helpers.ts` answers the
hook's request for
`https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@…/dist/standalone.iife.js`
with the locally built editor through Playwright route interception. The gate
tests this commit's editor and never touches the network; neither the SDK nor
the extension has a test seam for it.

## Real-platform system gate

Run the cross-repository persistence scenario from the sibling platform repo:

```bash
cd ../../../platform
pnpm test:system
```

The orchestrator starts isolated Postgres/Redis and the real API, creates a
short-lived project API key, builds the current SDK editor bundle and
`dist-system/`, then verifies translation CRUD plus context telemetry through
the MV3 boundary in Chromium. The key is generated inside the isolated run and
is never placed in the hostile page.

Programmatic `chrome.action.openPopup()` in headless Chromium does not reproduce
the physical toolbar gesture that grants `activeTab`. For this test only,
`dist-system/` receives an additional permission for the exact loopback fixture
origin. `vite.config.ts` rejects that override for the release `dist/` build,
whose artifact tests continue to require only the configured API origin.

## Automated coverage

The Playwright gate runs phases 1–5 without user input:

1. forged activation and proxy calls without a session;
2. exact route/body/response/rate/telemetry enforcement while active;
3. direct SDK deactivation and Forget-key revocation;
4. navigation while API-key validation is in flight;
5. popup closure while activation is pending.

`hostile-activation.spec.ts` documents a residual risk rather than a
boundary. A page that answers the activation before the detector can report
`collectContext: true` although its i18n config says `false`, and the
session then accepts telemetry for the page's own origin. The spec asserts
exactly that, and that telemetry for another origin, another project's export
and the key all stay out of reach.

The second case in that file is the same risk through the editor-loader hook: the
page plants its own hook and a fake `ComviInContextEditor`. A forged failure
cannot make the popup recommend the page's host, a forged success gives the fake
the editor's own routes for the validated project and nothing else, and the
extension loads neither the forged URL nor the CDN.

`editor-loader.spec.ts` covers how the editor reaches the page:

| Page           | What it is                                                     | What must happen                                                                                                       |
| -------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/site`        | `@comvi/core` with `devtools()`                                | No CDN request before Enable; one `@latest?comvi=<hour>` request after; SPA route and popup re-open load nothing again |
| `/site`        | the page calls the hook's `load()` itself                      | The editor is on the page, with no session until the popup activates                                                   |
| `/site`        | CDN unreachable                                                | Popup names the download failure and `cdn.jsdelivr.net`                                                                |
| `/csp-script`  | `script-src 'self'`                                            | Popup names the CSP reason and `https://cdn.jsdelivr.net`; no request leaves the page                                  |
| `/csp-style`   | `script-src 'self' https://cdn.jsdelivr.net; style-src 'self'` | Editor loads, the modal and its Preset dropdown render styled, zero CSP violations                                     |
| `/old-sdk`     | a `{v: "0.5.0"}` instance and no hook                          | Popup says the site must upgrade; Enable is not offered                                                                |
| `/no-devtools` | no Comvi instance                                              | Popup says what to add; Enable is not offered                                                                          |

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
   (the mock validates it), and click _Enable editor_. The harness configures
   `collectContext: false`. Then click _Run Phase 2_: the allowed route works,
   but telemetry remains closed; destructive/out-of-contract routes, wrong-project export,
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

| Phase | Boundary claim                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | No proxy authority exists without a popup-created, activated session; forged detection/activation grant nothing.                                                                                                                                                                                                               |
| 2     | An active session is confined to the exact editor route contract, bound to the validated project, size/rate limited, and telemetry stays closed when an honest site's i18n config disables it. Credentials never leave trusted extension contexts (no `/v1` request the page didn't authorize; page sends no `Authorization`). |
| 3     | "Forget key" revokes authority across the tab immediately.                                                                                                                                                                                                                                                                     |
| 4     | Navigation during validation cannot authorize the replacement document or reuse its channel.                                                                                                                                                                                                                                   |
| 5     | Popup teardown before confirmation revokes pending activation.                                                                                                                                                                                                                                                                 |
| 6     | Forget removes every persisted credential/session sharing the API key across origins.                                                                                                                                                                                                                                          |

## Notes

- The mock listens on `127.0.0.1:8791`. If that port is busy, change `PORT` in
  `mock-api-server.mjs` and `VITE_COMVI_API_BASE_URL` in `.env.gate-e`, then
  rebuild.
- `dist-gate-e/` is a throwaway build wired to the mock — **never ship it**.
  The shippable build remains `pnpm build` → `dist/` (pinned to
  `https://api.comvi.io`).
