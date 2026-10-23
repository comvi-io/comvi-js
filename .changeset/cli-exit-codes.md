---
"@comvi/cli": minor
---

**Breaking: one exit-code scheme for every command.** CI can now tell a conflict, an outage and a bad key apart:

| Code | Meaning                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- |
| `0`  | Done                                                                                                |
| `1`  | A conflict under `--force-mode abort`, or outdated types under `typegen --check`                    |
| `2`  | The platform was unreachable, timed out, answered 5xx or 429, or sent an unexpected response: retry |
| `3`  | The API key was rejected or lacks access, or a plan or credit limit was reached                     |
| `4`  | Invalid input                                                                                       |

Migration, for scripts that test exit codes:

- **`1` is narrower.** It no longer covers outages (now `2`), a rejected key (now `3`), a missing `.comvirc.json`, an existing `.comvirc.json` under `init`, `--force-mode ask` without a terminal, an unknown command or option, or a schema the emitter refuses (all now `4`).
- **`typegen --check`.** A rejected key now exits `3`, not `2`, and so does a project that no longer exists. Other 4xx responses, such as a wrong `apiBaseUrl`, exit `4`. `2` stays "the platform could not be reached".
- **Other mappings.** Running `comvi` with no command exits `4`. A plan or credit limit (`LIMIT_EXCEEDED`) exits `3` whatever the HTTP status; in 0.6 it exited `1`, or `2` under `typegen --check`. An unreadable local translation file exits `4`.
- **`comvi push` checks local locales first.** Before writing anything, it compares local locales with the locales the project has, as the key may write them. A locale the project lacks exits `4` and names it. Pass `--skip-unknown-locales` to push the rest. Locale spellings are matched as the platform matches them (`pt_br` is `pt-BR`), and two files for the same locale exit `4`. A platform that cannot list its locales skips the check with a warning.
- **`comvi push` with nothing to push** exits `4` instead of `0`. That covers no files, files without values, and every locale skipped. Pass `--allow-empty` when that is expected; then no commit is sent.
- **`comvi pull` and unreadable locales.** A locale the project has but the key cannot read exits `3`.
- **Restricted locales.** A locale the key's owner is restricted from is reported with the locales the project lacks, and also exits `4`.
- **Rolled-back commits are retried once.** A commit the platform rolled back on a database conflict (`409 TRANSACTION_CONFLICT`) is sent once more instead of failing.
- **`--locale` spellings.** `--locale` in `pull` and `push` matches any spelling of a locale.
