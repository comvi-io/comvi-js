---
"@comvi/core": patch
---

The auto-generated `instanceId` is now counted once per page rather than once per copy of
core. The `comvi-<n>` counter was module scoped, so two copies of `@comvi/core` on one page
(a CDN global plus a bundled npm copy, or a binding pinned to another patch) both minted
`comvi-1`, and a consumer keyed on the id could only ever see one of the two. The sequence
lives in a `Symbol.for("comvi.core.instanceCounter")` slot on `globalThis`, the same
cross-copy channel the duplicate-copy guard uses, so the second copy mints `comvi-2`. The id
format is unchanged, an explicitly passed `instanceId` is used as given, and minting never
reads `window.__COMVI__`, so a page-supplied hook cannot influence, break or stall
construction.
