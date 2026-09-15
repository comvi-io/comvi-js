---
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Generated declaration files now carry one tool-neutral header line, so `comvi typegen --check` no longer reports drift on a file the Vite plugin wrote. The two tools each stamped their own name on header line 3, and the check compares the file on disk against fresh output literally — a project generating types with the plugin in dev and checking them with the CLI in CI failed the check on every run, with no regeneration able to clear it. Files written by either tool at any earlier version still check clean; the header line is dropped from both sides of the comparison.
