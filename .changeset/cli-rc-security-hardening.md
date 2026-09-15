---
"@comvi/cli": patch
---

**Security: `comvi pull` now keeps every file it writes inside the configured translations
directory.** Locale and namespace names arrive from the TMS response and were interpolated
straight into the file template, so a response naming a locale `../../outside` produced a path
outside the catalog and `pull` would have written there. Both names are now required to be a
plain file name (`^[A-Za-z0-9][A-Za-z0-9_.-]*$` — no separators, no `..`, no leading dot), every
resolved path is checked against the translations directory with `path.relative`, and the check
is repeated against the resolved real paths before the directory is created and before the file
is written, so a symlink inside the tree that points out of it is refused as well. The
translations directory may itself be a symlink. `pull --dry-run` refuses the same names it would
refuse for a real write, and the error names the offending value and where it came from.
