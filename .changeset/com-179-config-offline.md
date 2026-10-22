---
"@comvi/cli": patch
---

`ConfigLoader.load` accepts `{ requireApiKey, optional }`: with `requireApiKey: false` it neither requires an API key nor reads `COMVI_API_KEY` / `COMVI_API_BASE_URL`, and with `optional: true` a project without `.comvirc.json` loads the defaults. `.comvirc.json` accepts `sourceLocale` and a `check` section (`identical`, `strict`).
