---
"@comvi/cli": patch
---

`comvi pull` shows what it changes in each file:

- **`--dry-run`.** Each file it would write is listed with its key changes: `(+2 ~1 −1)` for added, changed and removed keys, or `new`, `unchanged`, `nested keys written flat` or `replaces an unreadable file`. Under each file it names up to ten removed keys.
- **Local work it is about to lose.** A pull replaces each file with the platform's catalog. Before writing, it warns on stderr about keys that exist only locally, local files it cannot read (bad JSON, a non-string value) and, with `--empty-dir`, files it deletes because the platform has no catalog for them. It points to `comvi push`; the pull still runs and exits `0`.
