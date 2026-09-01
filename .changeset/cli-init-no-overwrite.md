---
"@comvi/cli": minor
---

`comvi init` no longer destroys an existing `.comvirc.json`, and its next-steps list is
numbered correctly.

- **Re-running `init` in a configured project used to overwrite the config silently.**
  `ConfigLoader.create()` writes the file wholesale, so a second `comvi init` replaced it with
  a freshly defaulted object — dropping `namespaces`, `locales`, `push.forceMode`,
  `pull.emptyDir` and any custom paths, with no prompt and no backup. `init` now checks for the
  file first and, unless `--force` is passed, prints the path and exits 1 without touching the
  file or contacting the API. Pass the new `--force` flag to get the old overwrite behaviour.
- **The "Next steps" list skipped a number.** With an API key configured — the common case —
  the steps printed as 1, 3, 4, 5, because the shared tail lines were hardcoded to 3-5 while
  the branch above them printed a single step 1. The list is now numbered contiguously in both
  branches, and the `--watch` alternative is shown as a hint under the generate-types step
  rather than as a step of its own.
