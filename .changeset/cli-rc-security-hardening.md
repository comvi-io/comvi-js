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

**Security: a locale or namespace named `__proto__`, `constructor` or `prototype` no longer
reaches `Object.prototype`.** The translations map was an ordinary object, so a response naming
a locale `__proto__` looked up the shared prototype instead of an empty slot and the write landed
on every object in the process; the same pattern read local catalogs and built the push payload,
and a `__proto__` namespace replaced a locale map's prototype outright. All three maps are now
null-prototype dictionaries read by own key only, so those names are ordinary entries — and a
`pull` still refuses to turn `__proto__` into a file name.

**Security: `"emptyDir": "false"` in `.comvirc.json` no longer deletes the catalog.** A quoted
`"false"` is a truthy string, so the option that clears the translations directory before a pull
was enabled by the exact value that reads as "off" — and nothing checked it. `pull.emptyDir` and
`strictParams` must now be a boolean or absent, `pull` and `push` must be objects, and each is
refused while the config is loading, before any request is sent or any file removed. The error
names the key and the type it received, and the exit code is 4 like every other invalid
configuration. `push.forceMode`, the other destructive switch, was already checked against its
four allowed modes before `push` sent anything.
