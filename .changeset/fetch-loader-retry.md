---
"@comvi/plugin-fetch-loader": minor
---

**The project-info request is retried, within bounds.** A 429, a 5xx or a
transport failure on `/v1/project` now gets up to two more attempts instead of
failing the whole load on one bad moment.

Only that request is retried. The CDN namespace load and the API translations
request are not: core's fallback-locale loop already sits behind them, and
retrying there would multiply what a `setLocaleAsync` costs on a flapping CDN.

The policy is deliberately narrow:

- a **timeout is never retried**, so a stalled server still fails as fast as
  `timeout` says and core's fallback-locale path runs on schedule;
- a **404 is never retried** — on the API path that is how the legacy export URL
  gets selected, not a failure;
- an **abort during the wait** ends it immediately, with no further request;
- `Retry-After`, in seconds, is honoured, and the **waits between attempts never
  add more than five seconds**; each attempt still runs under its own `timeout`.
  A server asking for a longer wait than the budget has left is taken at its
  word and not retried at all;
- everyone joining one in-flight project-info lookup shares one sequence of
  attempts, exactly as they already shared one request.

Pass `retry: false` to the installer to switch it off:

```ts
i18n.use(fetchLoader({ cdnUrl, retry: false }));
```
