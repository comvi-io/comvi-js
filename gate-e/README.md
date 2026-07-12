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
# 1. Build the js-sdk editor bundle if you haven't (needed by the build):
cd ../js-sdk && pnpm build && cd -

# 2. Install the browser once, then run the complete automated gate:
pnpm exec playwright install chromium
pnpm test:e2e
```

`test:e2e` builds `dist-gate-e/`, starts the mock server, loads the unpacked
extension into a clean persistent Chromium context, drives the real action
popup, and saves traces/screenshots on failure.

## Real-platform system gate

Run the cross-repository persistence scenario from the sibling platform repo:

```bash
cd ../platform
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
   (the mock validates it), leave telemetry unchecked, and click _Enable editor_.
   Then click _Run Phase 2_: the allowed route works, but telemetry remains
   closed by default; destructive/out-of-contract routes, wrong-project export,
   oversized bodies, and a request flood are all rejected —
   and none of the destructive routes appear in the mock log.
3. Phase 2 ends by calling the SDK's global `deactivate()` directly and proving
   that authority is revoked. Re-enable the editor, click _Forget key_, then
   run **Phase 3**; the proxy must be denied again.
4. **Phase 4** arms a delayed key validation and reloads the hostile document
   while validation is in flight. Enable the editor during the four-second
   countdown; the reloaded document automatically verifies that it inherited
   no capability.
5. **Phase 5** arms the same delayed validation without navigation. Enable the
   editor and close the popup before validation completes; the page automatically
   verifies that no pending/active capability survived.
6. **Phase 6** is a two-tab credential-family check: open the harness as both
   `http://127.0.0.1:8791` and `http://localhost:8791`, enable both with the
   same mock key, Forget it in either popup, then run
   `gateE.proxy("/v1/project/locales")` in both consoles. Both must be denied.

The page shows PASS/FAIL per check and an overall verdict. Results are also on
`window.__GATE_E_RESULTS__` / `window.__GATE_E_SUMMARY__` for tooling.

## What each phase proves

| Phase | Boundary claim                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | No proxy authority exists without a popup-created, activated session; forged detection/activation grant nothing.                                                                                                                                                                         |
| 2     | An active session is confined to the exact editor route contract, bound to the validated project, size/rate limited, and telemetry stays closed unless opted in. Credentials never leave the service worker (no `/v1` request the page didn't authorize; page sends no `Authorization`). |
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
