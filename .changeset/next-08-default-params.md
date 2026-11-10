---
"@comvi/next": minor
---

The server `<I18nProvider>` hands the browser the request instance's current `defaultParams`, so Server and Client Components render the same text. Only strings, finite numbers, booleans and `null` cross: any other value (a tag handler, an object, an array, a `Date`, `undefined`, `NaN`, `Infinity`) throws a `TypeError` at the server provider that names the param (`defaultParams.link`); give such a handler in a Client Component. A later payload (`router.refresh()`) that changes or clears them reaches the browser instance through `setDefaultParams()` when they differ by value; nothing remounts. Explicit `t()` params still win. The core's `defaultParams` accepts any value, as before.
