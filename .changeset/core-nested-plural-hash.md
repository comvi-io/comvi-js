---
"@comvi/core": patch
---

Fix `#` binding in nested plurals.

When a plural was nested inside another plural's option, the inner `#` octothorpe
was substituted with the **outer** plural's count instead of its own. For example
`{files, plural, other {# files in {folders, plural, other {# folders}}}}` with
`{ files: 3, folders: 5 }` rendered `3 files in 3 folders` instead of `3 files in 5 folders`.

The cause was a greedy `#` replacement that ran across the whole selected branch
(including nested `{...}` blocks) before recursing into them. Replacement is now
scoped to the current plural level: `#` inside nested blocks and quoted literals is
left untouched, so each plural binds `#` to its nearest enclosing count, per the ICU
MessageFormat spec.
