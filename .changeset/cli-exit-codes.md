---
"@comvi/cli": minor
---

**Breaking: one exit-code scheme for every command.** CI can now tell a conflict, an outage and a bad key apart:

| Code | Meaning                                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Done                                                                                                                                                                                                                                                                          |
| `1`  | The command ran and found a problem: a conflict under `--force-mode abort`, outdated types under `typegen --check`, errors under `comvi check` (warnings too with `--strict`), a value `comvi translate` could not translate; also a local failure such as an unwritable file |
| `2`  | The platform was unreachable, timed out, answered 408, 409, 425, 429 or 5xx, or sent an unexpected response: retry                                                                                                                                                            |
| `3`  | The API key was rejected or lacks access, or a plan or credit limit was reached                                                                                                                                                                                               |
| `4`  | Invalid input                                                                                                                                                                                                                                                                 |

Migration, for scripts that test exit codes:

- **`1` is narrower.** It no longer covers outages (now `2`), a rejected key (now `3`), a missing `.comvirc.json`, an existing `.comvirc.json` under `init`, `--force-mode ask` without a terminal when a conflict needs an answer, an unknown command or option, or a schema the emitter refuses (all now `4`).
- **`typegen --check`.** A rejected key now exits `3`, not `2`, and so does a project that no longer exists. Other 4xx responses, such as a wrong `apiBaseUrl`, exit `4`; 408, 409, 425 and 429 still exit `2`. `2` covers connection failures, timeouts, retryable HTTP responses and unexpected responses.
- **Other mappings.** Running `comvi` with no command exits `4`. A plan or credit limit (`LIMIT_EXCEEDED`) exits `3` whatever the HTTP status; in 0.6 it exited `1`, or `2` under `typegen --check`. An unreadable local translation file exits `4` in `push`, `check` and the read `translate` does before its push; a target file `translate` cannot read while writing is left untouched and the run exits `1`.
- **`comvi push` checks local locales first.** Before writing anything, it compares local locales with the locales the project has, as the key may write them. A locale the project lacks exits `4` and names it. Pass `--skip-unknown-locales` to push the rest. Locale spellings are matched as the platform matches them (`pt_br` is `pt-BR`), and two spellings of one locale, or two files for the same locale and namespace, exit `4`. A platform that cannot list its locales skips the check with a warning.
- **`comvi push` with nothing to push** exits `4` instead of `0`. That covers no files, files without values, and every locale skipped. Pass `--allow-empty` when that is expected; then no commit is sent.
- **`comvi pull` and locales the key may not read.** The platform lists only the locales a key may read, so a requested locale the key may not read exits `4` like one the project lacks, naming the locales the key may read. A locale the platform lists but sends no data for exits `3`.
- **Restricted locales.** In `push`, a locale the key's owner is restricted from is reported with the locales the project lacks, and also exits `4`.
- **Rolled-back commits are retried once.** A commit the platform rolled back on a database conflict (`409 TRANSACTION_CONFLICT`) is sent once more instead of failing.
- **`--locale` spellings.** `--locale` in `pull` and `push` matches a locale ignoring case and surrounding whitespace, with `_` and `-` alike.
