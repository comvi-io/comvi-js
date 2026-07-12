# Gate E — adversarial smoke test

The final release gate: on a deliberately hostile page, try to forge
detection/activation, call unrelated/destructive routes, exceed rate/body
limits, and keep going after "Forget key". **Every attempt must fail without
an authenticated network request reaching the API.**

Full end-to-end automation isn't possible (loading an unpacked extension uses
a native OS file dialog, and the toolbar popup is browser chrome), so this
harness makes the run a mostly-automated, repeatable procedure with a single
manual load step. It talks to a **local mock API** so no real key or the
production host is involved — the mock is also the ground truth for egress:
every `/v1/*` request the service worker makes is logged with its
`Authorization` header.

## One-time setup

```bash
# 1. Build the js-sdk editor bundle if you haven't (needed by the build):
cd ../js-sdk && pnpm build && cd -

# 2. Build the Gate-E extension variant (points at the local mock, own dir):
pnpm gate-e:build          # -> dist-gate-e/  (host_permissions: http://127.0.0.1:8791/*)

# 3. Start the mock API + hostile page server:
pnpm gate-e:serve          # -> http://127.0.0.1:8791
```

Then load the extension **once** (the only manual step that can't be scripted):

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `chrome-extension/dist-gate-e`.

## Run

Open <http://127.0.0.1:8791/> and:

1. **Phase 1** — click *Run Phase 1*. No session yet: every forged event and
   proxy attempt must be denied, egress log unchanged.
2. **Phase 2** — open the extension popup, paste **any** string as the key
   (the mock validates it), leave telemetry unchecked, and click *Enable editor*.
   Then click *Run Phase 2*: the allowed route works, but telemetry remains
   closed by default; destructive/out-of-contract routes, wrong-project export,
   oversized bodies, and a request flood are all rejected —
   and none of the destructive routes appear in the mock log.
3. Phase 2 ends by calling the SDK's global `deactivate()` directly and proving
   that authority is revoked. Re-enable the editor, click *Forget key*, then
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

| Phase | Boundary claim |
| --- | --- |
| 1 | No proxy authority exists without a popup-created, activated session; forged detection/activation grant nothing. |
| 2 | An active session is confined to the exact editor route contract, bound to the validated project, size/rate limited, and telemetry stays closed unless opted in. Credentials never leave the service worker (no `/v1` request the page didn't authorize; page sends no `Authorization`). |
| 3 | "Forget key" revokes authority across the tab immediately. |
| 4 | Navigation during validation cannot authorize the replacement document or reuse its channel. |
| 5 | Popup teardown before confirmation revokes pending activation. |
| 6 | Forget removes every persisted credential/session sharing the API key across origins. |

## Notes

- The mock listens on `127.0.0.1:8791`. If that port is busy, change `PORT` in
  `mock-api-server.mjs` and `VITE_COMVI_API_BASE_URL` in `.env.gate-e`, then
  rebuild.
- `dist-gate-e/` is a throwaway build wired to the mock — **never ship it**.
  The shippable build remains `pnpm build` → `dist/` (pinned to
  `https://api.comvi.io`).
