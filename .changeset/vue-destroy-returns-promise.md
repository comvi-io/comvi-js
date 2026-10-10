---
"@comvi/vue": patch
"@comvi/nuxt": patch
---

`destroy()` now returns a promise that resolves when plugin cleanup has finished.

`VueI18n.destroy()` drives the instance's async `destroy()`, and returned `void`: there was no way to
wait for a plugin's cleanup — an interval, a socket, a subscription — to actually finish, which a
test tearing an instance down between cases and a request-scoped instance on the server both need.
`await i18n.destroy()` (and `await destroy()` from `useI18n()`, in `@comvi/vue` and `@comvi/nuxt`)
now means the cleanup is done. Fire-and-forget callers are unaffected: the promise RESOLVES even
when the instance's cleanup rejects, and that error still reaches `onError` with source
`"plugin-cleanup"`. A repeat call returns the same promise rather than tearing down twice.
