# Comvi In-Context Editor — Chrome Extension

Browser extension that enables the Comvi in-context translation editor on any
site using [@comvi/core](https://www.npmjs.com/package/@comvi/core), without
requiring the host app to bundle the editor plugin.

The extension detects Comvi i18n on the page, then loads the standalone editor
runtime ([@comvi/plugin-in-context-editor](https://www.npmjs.com/package/@comvi/plugin-in-context-editor))
from a hosted URL (jsDelivr by default) and activates it with the user's API
key.

## Development

```bash
pnpm install
cp env.example .env
pnpm build       # produces dist/
pnpm dev         # rebuilds on change
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode).

### Environment

- `VITE_COMVI_EDITOR_SCRIPT_URL` — absolute URL to the in-context editor
  runtime. Defaults to the jsDelivr-hosted `@comvi/plugin-in-context-editor`
  standalone build. Pin a version (e.g. `@0.1.0`) for predictable releases.
- `VITE_COMVI_API_BASE_URL` — origin for the Comvi platform API
  (`https://api.comvi.io` for production).

## Packaging

```bash
pnpm zip   # builds and produces comvi-extension.zip in repo root
```

Upload `comvi-extension.zip` to the Chrome Web Store dashboard.
