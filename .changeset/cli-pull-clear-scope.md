---
"@comvi/cli": patch
---

`comvi pull --empty-dir` no longer deletes everything under the translations directory.

- **What it removes.** Only files the `fileTemplate` parses as a catalog, and only for locales the pull actually received. A file the template does not match is never removed: source code, a README, `index.ts`. So `--empty-dir -p src` no longer wipes `src`. Only directories emptied by those removals are removed.
- **Translation-shaped files.** With the default template, any `<dir>/<locale>.json` reads as a namespace, `src/fixtures/en.json` included. Run `--dry-run` first when `translationsPath` holds other JSON.
- **What it leaves.** Files of locales your API key cannot read, or that the project no longer has, are left in place; delete those by hand. The directory is no longer created when there is nothing to clear.
- **Ambiguous templates.** A `fileTemplate` with `{languageTag}` and `{namespace}` in one file name, such as `{languageTag}-{namespace}.json`, cannot tell which locale a file belongs to. `--empty-dir` refuses it with exit `4`.

`comvi pull` now judges `--locale` against the locales that came back with data.

- A locale the project has but the key's owner is restricted from exits `3` with "Locales not readable with this API key". Before, the pull wrote nothing for it and succeeded.
- The summary lists the locales and namespaces it wrote, not every project locale.

`--locale` and `--ns` given an empty value, as in `--locale "$UNSET_VAR"`, now exit `4` in `pull` and `push`. Before, an empty value counted as not given.
