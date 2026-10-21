---
"@comvi/cli": minor
---

`comvi check`: offline validation of local catalogs against the source locale (missing, stale, empty source, parameters, plural, select, tags, unsupported ICU, and opt-in identical); text and JSON output; exit codes 0 clean, 1 findings, 4 invalid input, 2 could not run. No API key, `.comvirc.json`, `.env` or network needed. A `.comvirc.json` read by `check` may use a `fileTemplate` without `{namespace}` (`{languageTag}.json`); `pull` and `push` still require it.

`TranslationSync` now reads a file template without `{namespace}` as one default-namespace catalog per locale, where it used to find no files: `readTranslations` returns those catalogs and `clearDirectory`/`previewClear` see them. `readTranslations` also takes `looseLocaleMatch` to match `locales` ignoring case and `_` versus `-`.
