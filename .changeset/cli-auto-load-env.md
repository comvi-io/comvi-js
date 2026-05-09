---
"@comvi/cli": minor
---

Auto-load `.env` for all CLI commands (`pull`, `push`, `init`, `generate-types`). The CLI walks up from the cwd to find the nearest `.env` file, stopping at the project root (the directory containing `package.json`) so it never picks up unrelated files in shared CI build directories.

Variables already set in `process.env` are **never** overwritten — real env vars always win over the file. This makes the auto-load safe to enable for CI: a checked-in `.env` cannot shadow a `COMVI_API_KEY` exported by your pipeline.

Parsing uses Node's built-in `util.parseEnv` (Node ≥20.12), so no new runtime dependencies. `init`'s help message ("add to .env file") now matches actual behaviour.

**New global flags**

- `--env-file <path>` — load a specific file instead of auto-discovery.
- `--no-env-file` — skip auto-loading entirely (also: `COMVI_NO_ENV=1`).
- `COMVI_DEBUG=1` — print the loaded path on stderr.

**Note:** Node 20.6+ also recognises `--env-file` as a built-in flag. If the path you pass is missing, Node fails first with exit code 9 (its own "file not found") before the CLI runs. When the file exists, Node passes the flag through to the CLI and our non-overwrite loader handles it.
