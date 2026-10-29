---
"@comvi/vue": minor
---

**BREAKING** (0.8-internal) — honest `t()` types and `<T components>`. Without generated catalogs, a `t()` call whose params are all text is typed `string`, and a call with a tag handler or a node param `string | VNodeArrayChildren` (it was typed `string`); an inline handler's argument is still inferred. `<T :components="{ b: 'strong', em: Emphasis }">` (the exported and the bound `<T>`) renders tags by name — an HTML tag name or a component, the tag's content as its default slot — so nested markup renders without `h()`. A tag renders through, in this order, a handler attribute, its `components` entry, a slot of its name; an attribute that is `undefined` no longer hides a slot (`null` still does: the tag renders as text). A slot whose tag holds markup gets the list of its parts, and development warns once to use `components`. No attribute falls through on either `<T>`: `class` and `style` are message params.
