---
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Generated declaration files now carry one tool-neutral header, so `comvi typegen --check` no longer reports drift on a file the Vite plugin wrote. The two tools each stamped their own name on header line 3, and the check compares the file on disk against fresh output literally — a project generating types with the plugin in dev and checking them with the CLI in CI failed the check on every run, with no regeneration able to clear it. The header line is now dropped from both sides of the comparison in every wording that has shipped, so it can never be the reason for a stale verdict again.

Regenerate once after upgrading and commit the result: a file written by 0.4 still compares as outdated, because 0.5 quotes keys and parameter names with `JSON.stringify` where 0.4 emitted single quotes and bare names, and the comparison does not normalize quoting.
