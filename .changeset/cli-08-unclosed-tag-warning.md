---
"@comvi/cli": minor
---

`comvi check` reports an opening tag that is never closed as an `unclosed tag` warning, not a `syntax` error: `@comvi/core` renders such a tag as its own text, so the message is valid and its generated types accept it. Each finding names the message's never-closed tags in order (`unclosed tag  de:k  <br> never closed: rendered as text`; `--format json`: `unclosedTag: [{ key, tags }]` in the source and every locale report, and `summary.unclosedTag`). A never-closed tag is no tag of the message, so a translation that drops a closing tag the source has also differs in `tags`. `--strict` fails on it, like every warning.
