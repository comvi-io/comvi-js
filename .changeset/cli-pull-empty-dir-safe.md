---
"@comvi/cli": patch
---

**`comvi pull --empty-dir` no longer deletes before the fetch; filtered pulls clear only
their scope.** The clear used to run first, so a network failure or a typo in `--ns` /
`--locale` left the working copy emptied and nothing written in its place. It now runs after
the translations have arrived and after every requested locale and namespace has been
confirmed present, so a failed pull leaves the directory exactly as it was.

The clear also follows the filters, in `rsync --delete` terms: `--ns common --empty-dir`
removes only `common`'s files and leaves every other namespace alone, and a directory the
clear empties is removed with its files. Without filters the whole directory is still
cleared, and the refusal to clear a path outside the project is unchanged.

`--empty-dir --dry-run` now lists every file it would remove instead of printing a single
line.
