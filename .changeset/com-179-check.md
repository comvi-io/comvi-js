---
"@comvi/cli": minor
---

`comvi check`: offline validation of local catalogs against the source locale (missing, stale, empty source, parameters, plural, select, tags, unsupported ICU, and opt-in identical); text and JSON output. Exit codes follow the CLI's scheme: 0 clean, 1 findings (or a local failure that fits no other code), 4 invalid input (flags, config, a catalog or directory it cannot read, an unknown locale, a usage error); `check` never talks to the platform, so never 2 or 3. No API key, `.comvirc.json`, `.env` or network needed. A `.comvirc.json` read by `check` may use a `fileTemplate` without `{namespace}` (`{languageTag}.json`); `pull` and `push` still require it.

`TranslationSync` now reads a file template without `{namespace}` as one default-namespace catalog per locale, where it used to find no files: `readTranslations` returns those catalogs and `clearDirectory`/`previewClear` see them.
