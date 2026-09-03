---
"@comvi/svelte": minor
---

A tag handler that throws inside `<T>` no longer takes the page down with it, and the peer range
narrows to `svelte: ^5.3.0`.

**Peer change.** `<T>` now wraps each tag handler in `<svelte:boundary>`, which Svelte added in
5.3. If you are on Svelte 5.0–5.2, upgrade to 5.3 or later; every 5.x release since then already
satisfies the new range.

**What changed.** A component passed through `components={{ strong: MyBadge }}` used to be rendered
unguarded: if it threw — a bad prop access, a failing child import — the error escaped `<T>` and
Svelte tore down the surrounding tree. It now degrades to the translation's own children — the same
degradation the React binding gives function handlers — and reports through
`i18n.reportError(error, { source: "translation", tagName })` so the failure is still visible to
your error handler. A working handler is untouched.
