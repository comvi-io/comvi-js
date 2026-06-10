---
"@comvi/plugin-fetch-loader": patch
---

Stale-request and robustness fixes from the fleet-wide audit:

- in-flight translation requests are aborted when the locale moves on (rapid locale switches) and on plugin cleanup — previously a slow request for an abandoned locale kept running and fired `onLoadSuccess` after the user had switched away. Aborted requests skip fallbacks and error callbacks.
- the `cache` option (Next.js `revalidate`/`tags`) is now applied to the dev/API path fetches too — previously it silently only worked for the CDN path
- malformed JSON in a 200 response now produces a diagnosable `[FetchLoader] Invalid JSON response from <url>` error (CDN, API, and project-info paths) instead of a bare `SyntaxError`
- `transformApiResponse` tolerates 200 responses missing the `namespaces` field (error envelopes from gateways)
- `fetchApiTranslations` accepts an optional `init` parameter (`signal`, `next`) — additive, used by the plugin internally
