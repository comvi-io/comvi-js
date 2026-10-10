---
"@comvi/cli": patch
---

`comvi push` now honours `push.forceMode` from `.comvirc.json`. The `--force-mode` flag was
declared with a baked-in `"ask"` default, so the flag value was always set and the configured
mode could never be read — a project that configured `"override"` still died in CI with
`--force-mode ask requires an interactive terminal`. The flag now defaults to unset and falls
back to `push.forceMode`, then to `ask`; passing `--force-mode` explicitly still wins.
