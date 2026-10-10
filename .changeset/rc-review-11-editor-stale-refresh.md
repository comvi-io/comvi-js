---
"@comvi/plugin-in-context-editor": patch
---

Fixed a stopped standalone activation's translation refresh being able to merge stale translations into the page after teardown or a replacement activation. The identity check now runs immediately before the merge (not only before the later render refresh), and outstanding refreshes are aborted on teardown.
