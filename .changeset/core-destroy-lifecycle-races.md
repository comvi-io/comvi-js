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
starts the plugins that had not begun yet, or the locale detector after them. One boundary
worth knowing: that late cleanup is awaited by the `init()` promise, not by `destroy()`, so
`destroy()` never hangs waiting for a plugin that is still starting up — await the `init()`
promise as well if you need both to have finished.

A repeat `destroy()` used to resolve immediately while the first call was still running the
cleanups, so a second caller — a component unmounting twice, a server host torn down by two
paths — was told the teardown had finished before it had. Every call is now the same attempt
and resolves when that one teardown has actually settled.

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
