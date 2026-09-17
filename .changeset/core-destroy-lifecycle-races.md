---
"@comvi/core": patch
"@comvi/vue": patch
---

Four lifecycle fixes for a `destroy()` that races an operation already in flight, plus one
loader bug that needed no race at all.

`init()` used to finish on a host that `destroy()` had already torn down: it read the
destroyed flag only on entry, so a `destroy()` landing during plugin initialization or the
initial namespace load still ended with `isInitialized === true`, an `initialized` event, and
the active namespaces and catalog put back after destroy had cleared them. It now re-checks
after every await and resolves quietly instead — `isInitialized` honestly stays `false`, and no
error is reported, because the usual cause is a component that unmounted while its provider's
`init()` was still running.

A plugin cleanup that arrived after `destroy()` had drained the queue used to be dropped
without ever running or reporting — a subscription or interval the plugin owned stayed alive
for the life of the page. Such a cleanup now runs, and a throw from it is reported exactly as
any other cleanup's is. In the same pass, `destroy()` during plugin initialization no longer
starts the plugins that had not begun yet, or the locale detector after them.

A locale switch that was in flight when `destroy()` landed used to apply anyway, changing
`locale` and emitting `localeChanged` on a destroyed host. A pending switch is now abandoned.

A loader that threw SYNCHRONOUSLY (rather than returning a rejected promise) used to poison
its namespace: the failure reported correctly the first time, but a rejected promise was left
parked under the load's key, so every later attempt got that same rejection back, the loader
was never called again, and the namespace could not load even after the loader was fixed. A
synchronous throw now behaves exactly like a rejected promise and the next attempt calls the
loader again.

Also: the dev warning for a `registerPlugin()` / `.use(plugins())` after `init()` said the
plugin "will never run". It still warns — registering late is still almost always a mistake —
but it now says what actually happens: the plugin does not run now, and the next `init()`
drains it along with everything already queued, accumulating another set of cleanups. The Vue
wrapper's equivalent warning says the same. Behaviour unchanged.
