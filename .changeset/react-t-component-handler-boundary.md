---
"@comvi/react": patch
---

A tag handler that throws inside `<T>` no longer takes the page down with it, whichever form it
takes.

Only one failure was contained before: a handler function that threw when `<T>` called it. Every
other way a handler can fail escaped and tore down the surrounding tree — a component or element
passed as `components={{ link: <MyLink /> }}` or as the `{ tag, props }` config form, and a
handler function whose returned element threw while React rendered it. All of them now degrade
the same way: the tag renders its own children in the handler's place, and the failure is
reported through `i18n.reportError(error, { source: "translation", tagName })`, so your error
handler still sees it. A working handler is untouched.

This is a client-side guard, by React's design: error boundaries do not run during
`renderToString`, so a handler that throws during a server render still fails that render.
