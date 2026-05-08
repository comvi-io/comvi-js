---
"@comvi/cli": minor
---

Add top-level `namespaces` and `languages` filters to `.comvirc.json`. Lets a project declare which namespaces/languages it uses once in config, instead of repeating `--ns a,b,c` in every `package.json` script that runs `comvi pull` / `comvi push`. CLI flags `--ns` / `--lang` continue to fully override the config (no merge), enabling one-off pulls without editing the file.

Pull now diffs the requested filter against what the server returned and fails with exit code 4 if any namespace or language is missing — typos in `.comvirc.json` (or in `--ns`) surface as a hard error in CI instead of silently producing empty translation files. The same exit code is used when validation rejects the config (e.g. `"namespaces": []`).

Push respects the same filter via the existing `TranslationSync.readTranslations` filter, so it only uploads the configured subset.
