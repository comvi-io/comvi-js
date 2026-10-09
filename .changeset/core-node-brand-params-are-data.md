---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/vue": minor
---

**Security: a translation param that only looks like a node is rendered as text.** Core decided
whether a param was a virtual node from its shape, and every `<T>` then rendered it as an element
with its own tag and props. A plain object of that shape, such as a value from an API response
or a URL passed as `name`, became a real element chosen by whoever sent the data.

Nodes are now recognised by a mark, not by shape. `createElement`, `createTextNode` and
`createFragment` brand what they return with a non-enumerable `Symbol.for("comvi.node")`
property, which `JSON.parse` cannot produce and neither `JSON.stringify` nor `structuredClone`
carries. `isVirtualNode()` is true only for a branded node, core passes only branded nodes and
React elements (a symbol `$$typeof`) through interpolation, and all four `<T>` converters render
anything else as text at every depth.

**BREAKING (breaking change on a 0.x minor):** an object literal such as
`{ type: 'element', tag: 'b', props: {}, children }` is no longer a node, and neither is a spread
copy of one. Build nodes with the factories, including in a tag callback's return value. A Vue
VNode passed as a param is text as well: its `__v_isVNode` marker is a plain boolean that data can
carry, and `<T>` never rendered one correctly; use a slot or the `components` prop.

Also fixed: `{constructor}` or `<valueOf>` in a message no longer resolves to the member every
object inherits. A placeholder with no own param of that name is a missing param, and such a tag
has no handler.
