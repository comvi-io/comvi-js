---
"@comvi/cli": minor
---

**BREAKING (pre-1.0):** Rename the `languages` config field and `--lang` CLI flag to `locales` / `--locale`. The TMS API has always called these `locales`, and `en-US` / `uk-UA` are technically locale tags (BCP 47), not languages — fixing the terminology now while we're still on `0.x` and before users have it in their configs.

**Migration:** rename `"languages"` to `"locales"` in `.comvirc.json`, and replace `--lang` with `--locale` in scripts. There is no compatibility shim — `languages` in config will be ignored, `--lang` will produce an unknown-flag error.

```diff
 {
-  "languages": ["en", "uk"]
+  "locales": ["en", "uk"]
 }
```

```diff
-comvi pull --lang en,uk
+comvi pull --locale en,uk
```

The `{languageTag}` placeholder in `fileTemplate` is **kept as-is** — it's the established BCP 47 term and renaming would break every existing user's `.comvirc.json` file paths.
