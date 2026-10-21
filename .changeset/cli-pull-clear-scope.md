---
"@comvi/cli": patch
---

`comvi pull --empty-dir` removes only translation files: files the `fileTemplate` parses as a catalog, of the locales the pull actually received. Source code, READMEs and other files under the target directory are never deleted, so `--empty-dir -p src` no longer wipes `src`. Files of locales your API key cannot read, or that the project no longer has, are left in place; delete those by hand.

`comvi pull` judges `--locale` against the locales that came back with data. A locale the project has but the key's owner is restricted from exits `4` with "Locales not readable with this API key", instead of writing nothing and succeeding. The summary lists the locales and namespaces it wrote, not every project locale.

`--locale` and `--ns` given an empty value (`--locale "$UNSET_VAR"`) exit `4` in `pull` and `push` instead of meaning "every locale".
