---
"@comvi/plugin-fetch-loader": patch
---

**A request whose whole scope `clearMessages()` drops is now aborted.**
Clearing stops the host from waiting on the matching loads, but their HTTP
requests kept running to completion — holding a connection open for an answer
nobody would read. The editor-save and webhook-refresh flow (clear, then
reload) paid for every namespace twice.

A request is abandoned only when the clear covers all of it:

- `clearMessages("en", "common")` aborts the request loading exactly that
  namespace, and leaves requests for other locales and other namespaces alone.
- `clearMessages()` and `clearMessages("en")` abort everything in
  flight for that scope.
- In API mode one request carries every active namespace. Clearing one of them
  leaves that request running, because the host is still waiting for the rest.

Nothing new is reported: an abandoned request raises neither `onLoadError` nor
the host's `loadError`, because the host had already stopped waiting for every
namespace it carried.

**What this does not cover:** a locale switch superseded by another switch. The
host keeps such a load, lets it finish and caches its result, and announces
nothing the loader could follow — so that request still runs to completion.
