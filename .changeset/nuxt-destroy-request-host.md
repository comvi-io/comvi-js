---
"@comvi/nuxt": patch
"@comvi/core": patch
---

The per-request server host is now destroyed once the request is answered.

A Nitro request built one host per locale and parked it in a WeakMap, and the app plugin built one
more for the SSR render itself; all of them were collectable but never destroyed, so a plugin's
cleanup — an interval, a socket, a subscription — ran on the client at teardown and never on the
server. The module now registers a Nitro server plugin that destroys every host the request made,
the app plugin's included.
`afterResponse` is the signal that means both "the handler returned" and "the response is written",
so a still-running render is never handed a destroyed host — which matters for
`defineCachedEventHandler` and `swr` / `isr` routes, where an aborted request still completes and
writes its render into the cache. A bare h3 app with no Nitro plugin falls back to the response's
`close` event, deferring on an abort until the response ends or one macrotask passes.

Two smaller consequences. `useTranslation()` / `loadTranslations()` on a request whose hosts were
already destroyed now throws a named error instead of quietly building a host nothing will ever
tear down. And a `destroy()` that fails is reported through the host's `onError` with the new
`ErrorReportContext` source `"request-cleanup"` rather than thrown into a response that has already
been sent.
