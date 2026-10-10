---
"@comvi/core": patch
---

An ICU plural whose branch holds markup, a parameter or a quoted literal no longer fills the shared
template cache with one entry per count.

`{count, plural, other {<b>#</b> messages}}` used to substitute the count into the branch text
before re-parsing it, so `<b>1</b> messages`, `<b>2</b> messages` and every other count each became
their own cache entry. On a page that shows a range of counts the plural branches alone could
evict everything else out of the 1000-entry cache, and every count paid a fresh parse. The branch
now reaches the parser unchanged and `#` resolves at render time, so one entry serves every count.

Rendering is unchanged, including the cases that make `#` subtle: a nested plural rebinds `#` and
the outer count is restored after it, a `#` that arrives inside a parameter value is left alone, a
quoted `'#'` stays literal, and a `#` inside a `select` branch still resolves against the plural
that encloses it. The common `{count, plural, one {# item} other {# items}}` shape keeps its
existing fast path and still parses nothing at all, at the same cost as before: the substitution
on that path is measured by `pnpm perf`, whose plural case is within noise of the previous release.
