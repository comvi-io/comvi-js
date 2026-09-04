---
"@comvi/react": patch
---

A component or element tag handler that throws inside `<T>` no longer takes the page down with it.

Passing a component or an element through `components={{ link: <MyLink /> }}` (or the
`{ tag, props }` config form) used to be rendered unguarded: React renders it after `<T>` has
already returned, so a throw inside it — a bad prop access, a failing child — escaped `<T>` and
tore down the surrounding tree. A handler written as a plain function has always degraded
instead, and now these two do the same: the tag renders its own children in the handler's place
and the failure is reported through `i18n.reportError(error, { source: "translation", tagName })`,
so your error handler still sees it. A working handler is untouched.

This is a client-side guard, by React's design: error boundaries do not run during
`renderToString`, so a handler that throws during a server render still fails that render.
