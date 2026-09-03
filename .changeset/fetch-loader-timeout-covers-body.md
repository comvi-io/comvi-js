---
"@comvi/plugin-fetch-loader": patch
---

**The request timeout now covers reading the response body.** The timer used to
be cleared as soon as the response headers arrived, so a server that answered
and then stalled mid-body held the load open indefinitely: `setLocaleAsync`
never settled, no fallback locale was tried, and `onLoadError` never fired.

All four request shapes are bounded now — the CDN namespace fetch, the API
translations request, the project-info lookup, and the export request the 404
fallback reaches for — each under its own full timeout, failing with the same
`Request timeout after Nms` error a stalled connection produces.

If you supply your own transport through `fetchFn`, a non-OK response is now
also read for its `Retry-After` header. A response object without `headers` is
handled, so a hand-written transport that answers with a bare
`{ ok, status, statusText }` keeps working.
