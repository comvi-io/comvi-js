# Comvi In-Context Editor — Chrome Extension

Browser extension that enables the Comvi in-context translation editor on any
site using [@comvi/core](https://www.npmjs.com/package/@comvi/core), without
requiring the host app to bundle the editor plugin.

The extension detects Comvi i18n on the page, then injects the standalone editor
runtime ([@comvi/plugin-in-context-editor](https://www.npmjs.com/package/@comvi/plugin-in-context-editor))
into the page's MAIN world via `chrome.scripting.executeScript` and activates it
through an authenticated proxy (see below). The runtime ships inside the
extension package (`editor.iife.js`) — Manifest V3 forbids loading remote code.

## Security model

**API keys never enter the page.** The page's MAIN world is shared with
arbitrary first- and third-party scripts, so nothing secret crosses that
boundary in either direction:

- The key is entered in the popup, validated by the **service worker** against
  the API, and only then persisted (per-origin, `chrome.storage.local`). It can
  be removed with the popup's "Forget key" button.
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
- Content scripts are **injected on demand** under the `activeTab` grant when
  the popup opens — the extension does not run on `<all_urls>`.
- Context collection (page origin, translation keys, on-screen layout hints)
  is sent to **your own** Comvi project only after an explicit per-activation
  opt-in in the popup. The checkbox is off by default, and the same value is
  bound into both the service-worker session and the injected editor runtime;
  hostile page code cannot enable telemetry for an already-active session.

**Residual risk, by design:** DOM events in the MAIN world are forgeable, so
while a session is _active_ on a tab, scripts on that page can invoke the same
proxy channel — meaning they can perform exactly the editor's own operations
(read project locales/translations and save or delete translation keys; when
the user opted in, submit context telemetry for their own origin) against the project of the
validated key. They cannot reach any other API route, another project's
export, another origin's telemetry, or the key itself. Only enable the editor on sites you operate or trust, and prefer keys
scoped to a single project with the minimum required permissions. A hostile
page can also fake the "Comvi detected" status in the popup and the activation
acknowledgement — both are treated as UI/readiness signals only and grant no
authority beyond the session the user explicitly opened.

## Testing

```bash
pnpm typecheck
pnpm test        # vitest — route contract, sanitizers, SW session/proxy integration
pnpm verify      # typecheck + build + full suite incl. dist artifact checks + audit
```

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
  (`https://api.comvi.io` for production).
- `COMVI_EDITOR_BUNDLE_PATH` — optional path to a `standalone.iife.js` build of
  `@comvi/plugin-in-context-editor`. Defaults to the sibling js-sdk build at
  `../../packages/plugin-in-context-editor/dist/standalone.iife.js`
  (build it first from the repository root with
  `pnpm --filter @comvi/plugin-in-context-editor build`).

## Packaging

```bash
pnpm zip   # builds and produces comvi-extension.zip in repo root
```

Upload `comvi-extension.zip` to the Chrome Web Store dashboard.
