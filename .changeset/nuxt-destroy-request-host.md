---
"@comvi/nuxt": patch
"@comvi/core": patch
---

The per-request server host is now destroyed when the response ends.

A Nitro request built one host per locale and parked it in a WeakMap, which made the hosts
collectable but never destroyed: a plugin's cleanup — an interval, a socket, a subscription — ran
on the client at teardown and never on the server. Each request now registers one hook on its
response's `close` event, which fires for a finished, an aborted and an errored response alike and
always after the last chunk is written, and destroys every locale instance that request built. A
`destroy()` that fails is reported through the host's `onError` with the new
`ErrorReportContext` source `"request-cleanup"` instead of being thrown into a response that has
already been sent.
