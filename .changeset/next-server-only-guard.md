---
"@comvi/next": minor
---

**`@comvi/next/server` now guards itself against the client bundle, so you can drop `server-only`
from your app.** The entry imports `server-only` itself, and `@comvi/next` depends on it. A Client
Component that imports `@comvi/next/server`, directly or through your own server module, fails
`next build` with Next's message:

```text
'server-only' cannot be imported from a Client Component module. It should only be used from a Server Component.
```

This holds under webpack and Turbopack. Server Components and Route Handlers import it exactly as
before.

`package.json` now lists `dist/server.js` and `dist/server.dev.js` in `sideEffects` instead of
`false`, so no bundler drops the guard. A bundler that builds `@comvi/next/server` outside Next must
resolve with the `react-server` condition, as Next's server layer does, or the bundle throws on load.

To migrate, remove `import "server-only";` from your server module and run
`npm uninstall server-only` if nothing else in your app imports it. Keeping both is harmless.

`@comvi/next/middleware` has no guard: middleware never enters the client graph, and the guard
would make plain-node unit tests of your middleware throw.
