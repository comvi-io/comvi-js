---
"@comvi/react": minor
---

**BREAKING** (0.8-internal) — honest `t()` types and `<T components>`. Without generated catalogs, a `t()` call whose params are all text is typed `string`, and a call with a tag handler or an element param `string | ReactElement` (it was typed `string`, so `.toUpperCase()` on an element compiled and threw); an inline handler's argument is still inferred. `<T components={{ b: "strong", em: Emphasis }}>` renders tags by name — an HTML tag name or a component, the tag's content as its `children` — so nested markup needs no handler; a handler prop of the tag's name wins, and a prop that is `undefined` leaves the tag to `components` (`null` is a value: the tag renders as text). With generated catalogs a tag param of `<T>` is optional, since `components` may render it.
