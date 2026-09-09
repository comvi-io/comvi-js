---
"@comvi/cli": minor
---

`comvi push` now flattens nested JSON to dotted keys instead of uploading `[object Object]`.

`pull` writes flat files with dotted keys, but `push` forwarded a parsed file verbatim, and the
API stringifies every value it is handed. A nested catalog such as `{"nav": {"home": "Home"}}`
therefore uploaded one key `nav` whose value was the literal string `[object Object]`.

`push` now flattens plain nested objects into dotted keys (`nav.home`), so both file shapes
upload identically and an already-flat file passes through key for key. `--dry-run` and the
conflict diff read the same flattened keys. A non-string leaf (number, boolean, null, array)
is no longer silently coerced: the push fails with exit code 4 and names the file and the
dotted key.

A key that appears both flat and through nesting (`"a.b"` next to `{"a": {"b": …}}`) is also
an error rather than a silent last-writer-wins.
