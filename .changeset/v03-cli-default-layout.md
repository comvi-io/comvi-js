---
"@comvi/cli": minor
"@comvi/vite-plugin": minor
---

Change the default local translation file layout for v0.3. The namespace marked as default in the TMS now maps to root locale files such as `en.json`, while other namespaces map to `{namespace}/{languageTag}.json` such as `admin/en.json`.

`comvi pull`, `comvi push`, and CLI type generation now resolve the default namespace from the backend instead of treating `.comvirc.json` as the source of truth. Custom `fileTemplate` values remain literal; set `"fileTemplate": "{languageTag}/{namespace}.json"` to keep the v0.2 layout.
