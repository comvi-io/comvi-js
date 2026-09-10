---
"@comvi/core": patch
---

The auto-generated `instanceId` no longer collides with an instance a consumer already
tracks. The `comvi-<n>` counter is module scoped, so two copies of `@comvi/core` on one page
(a CDN global plus a bundled npm copy, or a binding pinned to another patch) both minted
`comvi-1`, and a consumer keyed on the id could only ever see one of the two. Minting now
skips any candidate id the discovery hook's `instances` map already holds, so the second copy
gets `comvi-2`. Explicit `instanceId` options are untouched, and against a raw queue array
there is no live id set to consult, so the consumer dedupes on drain.
