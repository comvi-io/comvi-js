---
"@comvi/plugin-fetch-loader": patch
---

**The legacy export URL now validates its locale and namespaces like every
other URL the loader builds.** It was the one builder that skipped the check,
so a locale or namespace carrying path segments would have been interpolated
into the request path unexamined. Nothing reaches it with bad input today — the
only route to it validates first — and now nothing can.
