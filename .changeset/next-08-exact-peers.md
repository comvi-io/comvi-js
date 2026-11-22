---
"@comvi/next": minor
---

`@comvi/next` asks for `@comvi/core` and `@comvi/react` at exactly its own version (was `^0.7.0`): core and every binding ship one version. A release, a patch release and an `rc.N` alike pin both peers to that version, and the publish job refuses a packed tarball where they differ.
