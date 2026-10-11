---
"@comvi/core": patch
---

`#` inside `plural` and `selectordinal` is now formatted for the message's locale, as ICU MessageFormat defines it: `{count, plural, other {# items}}` renders `1,234 items` in `en` and `1.234 items` in `de`. Previously `#` inserted the raw digits. Exact-match selectors (`=0`, `=1`) still compare the number itself. Use `{count}` instead of `#` where the raw digits are wanted.
