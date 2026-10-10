---
"@comvi/cli": patch
---

The request timeout now covers the response body, API failures show the platform's error message, and `push` reads back every namespace and locale `pull` writes. `pull --empty-dir` restores the previous catalog when a write fails, `init --force` replaces the config atomically, and `.comvirc.json` refuses a non-object root, unknown `push`/`pull` fields, an unknown `forceMode` and an `augment` that is not a module specifier, all with exit code 4.
