# Comvi In-Context Editor — Chrome Extension

Browser extension that enables the Comvi in-context translation editor on any
site using [@comvi/core](https://www.npmjs.com/package/@comvi/core), without
requiring the host app to bundle the editor plugin.

The extension detects Comvi i18n on the page, then injects the standalone editor
runtime ([@comvi/plugin-in-context-editor](https://www.npmjs.com/package/@comvi/plugin-in-context-editor))
into the page's MAIN world via `chrome.scripting.executeScript` and activates it
with the user's API key. The runtime ships inside the extension package
(`editor.iife.js`) — Manifest V3 forbids loading remote code.

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
  `../js-sdk/packages/plugin-in-context-editor/dist/standalone.iife.js`
  (build it first: `cd ../js-sdk && pnpm build`).

## Packaging

```bash
pnpm zip   # builds and produces comvi-extension.zip in repo root
```

Upload `comvi-extension.zip` to the Chrome Web Store dashboard.
