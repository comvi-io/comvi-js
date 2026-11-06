---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/vue": minor
"@comvi/solid": minor
"@comvi/svelte": minor
---

**BREAKING** (0.8-internal) — a plain `{name}` is always text, in the core and in every binding. A present value prints `String(value)`: numbers, `0`, `""`, a `Date` and a list of text print as before, and a function, an object or a list holding one now print `String(value)` too, instead of passing through for the binding to render. A React element, a Vue VNode or a Solid JSX element passed as a `{name}` param is no longer rendered as a node (a Solid server template `{ t: "<img …>" }` no longer reaches the HTML), and a null-prototype object there throws `String()`'s `TypeError`, as in a `select`. In Solid such an element is not supported even as text: the server prints `[object Object]`, the browser the element's own `String()`, and under hydration in development Solid itself reports a hydration mismatch when it creates the element. A missing value renders as before. Markup comes only from tags, through a handler or `components`; a param keyed by a tag's name stays that tag's handler:

```tsx
// Before: "Hello, {name}!"   t("greeting", { name: <strong>Olena</strong> })
// After:  "Hello, <strong>{name}</strong>!"
<T i18nKey="greeting" name="Olena" components={{ strong: "strong" }} />
```

Without generated catalogs, the bindings' `UntypedParams` take text values (strings, numbers, bigints, booleans, `Date`, lists of them, `null`/`undefined`) and tag handlers, not elements or other objects; its optional type parameter is the `components` map of `<T>`. `formatValue` leaves `@comvi/core/internal`.
