---
"@comvi/core": patch
---

`devtools({ editorVersion })` fails closed. An explicit value that is not an exact version (`major.minor.patch`, optionally with a prerelease such as `0.6.0-rc.1`) no longer falls back to `latest`: the editor loader is still installed so the Comvi browser extension can explain the problem, but it requests nothing, and its `load()` answers the new failure code `invalid-editor-version`. The extension's popup tells the translator that the pin must be an exact version like `1.2.3`, and development builds warn as before. Leaving `editorVersion` out, or passing `"latest"`, still loads `latest`.
