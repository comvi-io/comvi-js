---
"@comvi/cli": minor
---

**Breaking: one exit-code scheme for every command.** CI can now tell a conflict, an outage and a bad key apart:

| Code | Meaning                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- |
| `0`  | Done                                                                                                |
| `1`  | A conflict under `--force-mode abort`, or outdated types under `typegen --check`                    |
| `2`  | The platform was unreachable, timed out, answered 5xx or 429, or sent an unexpected response: retry |
| `3`  | The API key was rejected or lacks access                                                            |
| `4`  | Invalid input                                                                                       |

Migration, for scripts that test exit codes:

- **`1` is narrower.** It no longer covers outages (now `2`), a rejected key (now `3`), a missing `.comvirc.json`, an existing `.comvirc.json` under `init`, `--force-mode ask` without a terminal, an unknown command or option, or a schema the emitter refuses (all now `4`).
- **`typegen --check` and a rejected key.** A rejected key now exits `3`, not `2`; `2` stays "the platform could not be reached".
- **`comvi push` checks local locales first.** Before writing anything, it compares local locales with the locales the project has, as the key may write them. A locale the project lacks exits `4` and names it. Pass `--skip-unknown-locales` to push the rest. Locale spellings are matched as the platform matches them (`pt_br` is `pt-BR`), and two files for the same locale exit `4`. A platform that cannot list its locales skips the check with a warning.
- **`comvi push` with no translation files** exits `4` instead of `0`. Pass `--allow-empty` when that is expected.
- **Rolled-back commits are retried once.** A commit the platform rolled back on a database conflict (`409 TRANSACTION_CONFLICT`) is sent once more instead of failing.
- **`--locale` spellings.** `--locale` in `pull` and `push` matches any spelling of a locale.
