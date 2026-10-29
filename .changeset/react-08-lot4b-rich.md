---
"@comvi/react": minor
---

**BREAKING** (0.8-internal) — honest `t()` types and `<T components>`. Without generated catalogs, a `t()` call whose params are all text is typed `string`, and a call with a tag handler or an element param `string | ReactElement` (it was typed `string`, so `.toUpperCase()` on an element compiled and threw); an inline handler's argument is still inferred. `<T components={{ b: "strong", em: Emphasis, link: { component: "a", props: { href: "/terms" } } }}>` renders tags by name — an HTML tag name, a component, or `{ component, props }` for one that needs props of its own; the tag's content is its `children` — so nested markup needs no handler; a handler prop of the tag's name wins, and a prop or an entry that is `undefined` leaves the tag to the next (`null` is a value: the tag renders as text). With generated catalogs a tag param of `<T>` is optional only when `components` is passed: without it a missing handler stays a type error.
