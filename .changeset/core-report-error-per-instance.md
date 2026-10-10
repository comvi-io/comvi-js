---
"@comvi/core": patch
---

`reportError()` no longer silences an error for every other i18n instance in the process.

The first instance to report an error used to stamp a `Symbol.for("comvi.error.reported")` property
onto the error object itself, and every instance checked that same stamp before reporting. The mark
travelled with the object, so a second instance handed the same `Error` stayed silent — its `onError`
never fired. That is reachable in ordinary code: `init()` reports and then rethrows, so a caller
that retries on a fresh instance, an app that shares one sentinel error, or an SSR pool where two
instances touch one rejection all lost the second report. It also mutated an object the application
owns, which was visible to any code inspecting the error.

Each instance now keeps its own `WeakSet` of the errors it has reported. The guarantee developers
actually rely on is unchanged: one instance reports a given error once, however many times it is
rethrown. A different instance reporting the same error now gets its own callback, as it should.
