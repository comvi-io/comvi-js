---
"@comvi/cli": minor
---

New command `comvi translate`. It machine-translates the values your project is missing on the platform and writes them into your local files. The translations are saved on the platform as not reviewed.

- **What it does.** It pushes your local files first (`--no-push` skips this; `--force-mode` works as in `comvi push`), starts machine translation for every key and locale whose value is empty, waits for the jobs, and writes the platform's values where your files have none, human translations included.
- **Local files.** It writes only keys that are in your source catalog, and only where the local value is missing: absent, `null` or `""`. It never overwrites a local value. The rest of each file stays as it is, nested or flat.
- **Limits.** `--max-keys` (default 1000) caps how many key and locale pairs one run translates. A run over it starts nothing and exits `4`; `--max-keys 0` removes the cap. `--dry-run` prints the count and the credit estimate and changes nothing.
- **Waiting.** `--timeout` (default `20m`) stops the wait. The jobs keep running on the platform, and what is ready is written.
- **Access.** The API key needs the new `mt:use` scope ("Machine translation (uses credits)"). Without it, the command exits `3` before it pushes anything.
- **Exit codes.** `0` done; `1` some values failed to translate; `2` a timeout, or the platform was unavailable; `3` credits ran out, or the key lacks access; `4` invalid input, over `--max-keys`, or a platform without this command. Translated values are written in every case. `--format json` prints a summary for scripts.

`ApiClient` gains `fillMissing()` and `getMtJobStatus()`, and `pushTranslations()` takes `scheduleAutoMt`.
