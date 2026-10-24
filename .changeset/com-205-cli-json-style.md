---
"@comvi/cli": patch
---

`comvi translate` and `comvi pull` wrote every catalog with two-space indentation, LF and a final newline, so a repository formatted with tabs, four spaces or CRLF failed its formatter check after each run. Both now write a file in its own indentation, line endings and final newline. A new file takes those of the source locale's file for the same namespace (`pull` uses `sourceLocale` from `.comvirc.json`), else two spaces and LF as before.
