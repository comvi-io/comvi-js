---
"@comvi/plugin-fetch-loader": minor
---

**The project-info request is retried, within bounds.** A 429, a 5xx or a
transport failure on `/v1/project` now gets up to two more attempts instead of
failing the whole load on one bad moment. The policy is deliberately narrow:

- a **timeout is never retried**, so a stalled server still fails as fast as
  `timeout` says and core's fallback-locale path runs on schedule;
- a **404 is never retried** — on the API path that is how the legacy export URL
  gets selected, not a failure;
- an **abort during the wait** ends it immediately, with no further request;
- `Retry-After`, in seconds, is honoured, and the retries may add **at most five
  seconds in total** — a server asking for longer is taken at its word and not
  retried at all;
- everyone joining one in-flight project-info lookup shares one sequence of
  attempts, exactly as they already shared one request.

Pass `retry: false` to the installer to switch it off:

```ts
i18n.with(fetchLoader({ cdnUrl, retry: false }));
```
