---
"@comvi/plugin-fetch-loader": patch
---

**Clearing translations now cancels the requests that were still fetching
them.** `clearTranslations()` stops the host from waiting on the matching
loads, but their HTTP requests kept running to completion — holding a
connection open for an answer nobody would read. The editor-save and
webhook-refresh flow (clear, then reload) paid for every namespace twice.

The loader now follows the host: a clear aborts every in-flight request in the
cleared scope, and only that scope. A clear naming a locale and a namespace
leaves other locales and other namespaces loading; a scopeless
`clearTranslations()` aborts everything in flight. In API mode, where one
request carries a batch of namespaces, clearing any namespace in the batch
aborts that request.

Nothing new is reported: a cancelled request raises neither `onLoadError` nor
the host's `loadError`, because the host had already stopped waiting for it.

This does not cover a locale switch that another switch supersedes — the host
keeps such a load and caches its result, and announces nothing the loader could
follow.
