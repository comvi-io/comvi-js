---
"@comvi/next": minor
"@comvi/react": minor
---

The server `<I18nProvider>` hands the browser the request instance's current `defaultParams` with every payload, so Server and Client Components render the same text. On the SSR surfaces — `createGetI18n()`'s configuration, the client provider's `options` and `<I18nHandover defaultParams>` (new prop, `@comvi/react`) — values must be strings, finite numbers, booleans or `null`: another kind of value is a type error, a non-finite number is refused at run time, and either throws, naming the param. Pass tag handlers with the translation (params) or through `components`; adding a client handler to `options.defaultParams` is no longer supported. A new payload (`router.refresh()`) replaces the browser's whole set in the same render as its catalogs, without a remount; an empty set clears it, and a set equal to the current one publishes no `defaultParams` update (subscribers are not notified because of it). Explicit `t()` params win. The core's own `defaultParams` and `setDefaultParams()` take any value, as before.
