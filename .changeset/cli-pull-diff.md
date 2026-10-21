---
"@comvi/cli": patch
---

`comvi pull` shows what it changes in each file:

- **`--dry-run`.** Each file it would write is listed with its key changes: `(+2 ~1 −1)` for added, changed and removed keys, or `new`, `unchanged`, `nested keys written flat` or `replaces an unreadable file`. Under each file it names up to ten removed keys.
- **Dropped local keys.** A pull replaces each file with the platform's catalog. Before writing, it warns on stderr about keys that exist only locally and will be lost, and points to `comvi push`. The pull still runs and exits `0`.
