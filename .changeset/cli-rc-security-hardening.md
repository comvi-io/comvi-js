---
"@comvi/cli": patch
---

**Security: `comvi pull` now keeps every file it writes inside the configured translations
directory.** Locale and namespace names arrive from the TMS response and were interpolated
straight into the file template, so a response naming a locale `../../outside` produced a path
outside the catalog and `pull` would have written there. Every resolved path is now checked
against the translations directory with `path.relative`, and the check is repeated against the
resolved real paths before the directory is created and before the file is written, so a symlink
inside the tree that points out of it is refused as well. The translations directory may itself
be a symlink.

A name is refused only for what makes a path unsafe: a `/` or `\` separator, a control
character, a leading dot, an empty name, or the literal `__proto__`. Everything the platform
lets you create still pulls — a namespace with a space, an `@`, or non-ASCII text writes exactly
as it did in 0.4.1, up to the platform's own limits of 255 characters for a namespace and 50 for
a locale code.

The whole response is judged before anything happens: every locale and namespace it declares,
then every resolved path, and only then the first `mkdir`. A name the CLI refuses now costs the
project nothing — it used to abort from inside the write loop, which with `--empty-dir` meant the
catalog was already deleted and only the namespaces sorted before the offending one came back,
on every run. `pull --dry-run` refuses the same names a real write would, and the error names the
offending value, where it came from, and what is wrong with it.

**Security: a locale or namespace named `__proto__`, `constructor` or `prototype` no longer
reaches `Object.prototype`.** The translations map was an ordinary object, so a response naming
a locale `__proto__` looked up the shared prototype instead of an empty slot and the write landed
on every object in the process; the same pattern read local catalogs and built the push payload,
and a `__proto__` namespace replaced a locale map's prototype outright. All three levels of the
map are now null-prototype dictionaries read by own key only, so those names are ordinary
entries — and a `pull` still refuses to turn `__proto__` into a file name.

**`comvi push` no longer invents conflicts for keys named `constructor`, `toString`, `valueOf` or
`hasOwnProperty`.** A remote catalog is an ordinary JSON object, so looking up one of those keys
answered with an inherited function instead of "the remote does not have this key". A local
catalog holding any of them made `--force-mode abort` refuse a perfectly clean push, made
`keep` report them as skipped, and made `push --dry-run` show them as conflicts instead of new
keys. Key-level maps from the API are null-prototype now, and both comparisons use own-key
lookups, so a key named after anything on `Object.prototype` is compared as the ordinary key it
is.

**Security: `"emptyDir": "false"` in `.comvirc.json` no longer deletes the catalog.** A quoted
`"false"` is a truthy string, so the option that clears the translations directory before a pull
was enabled by the exact value that reads as "off" — and nothing checked it. `pull.emptyDir` and
`strictParams` must now be a boolean or absent, `pull` and `push` must be objects, and each is
refused while the config is loading, before any request is sent or any file removed. The error
names the key and the type it received (a `null` is reported once, not as "null null"), and the
exit code is 4 like every other invalid configuration. `push.forceMode`, the other destructive switch, was already checked against its
four allowed modes before `push` sent anything.
