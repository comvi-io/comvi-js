---
"@comvi/cli": minor
---

**Breaking:** `--env-file <path>` is now `--dotenv <path>`, and `--no-env-file` is now
`--no-dotenv`. `COMVI_NO_ENV=1` is unchanged.

The old names could not be made to work. Node claims `--env-file` for itself across the _entire_
command line — not just the arguments before the script path — so
`comvi --env-file missing.env pull` never reached the CLI at all: node printed
`node: missing.env: not found` and exited **9**, while the documented behaviour
(`✗ --env-file points to a missing file: …`, exit 4) was unreachable. When the file existed node
passed the flag through without loading it, so the flag half-worked and failed opaquely. Verified
on Node 24 and 25, and identically through the `comvi` bin shim.

Under the new name the flag behaves as documented: a missing file is reported as
`✗ --dotenv points to a missing file: <path>` with exit code 4, and `--no-dotenv` skips
auto-discovery. Rename the flag in any scripts or CI jobs that pass it; `COMVI_NO_ENV=1` keeps
working as the environment-variable equivalent of `--no-dotenv`.
