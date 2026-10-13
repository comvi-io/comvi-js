---
"@comvi/core": patch
---

`#` inside `plural` and `selectordinal` is now formatted for the message's locale, as ICU MessageFormat defines it: `{count, plural, other {# items}}` renders `1,234 items` in `en` and `1.234 items` in `de`. Previously `#` inserted the raw digits. `#` follows the `Intl.NumberFormat` defaults, so a fractional count is rounded to three fraction digits (`1.23456` renders `1.235`). Exact-match selectors (`=0`, `=1`) still compare the number itself. A count of negative zero renders `0`, without a sign. Use `{count}` instead of `#` where the raw digits are wanted.
