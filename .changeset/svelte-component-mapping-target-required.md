---
"@comvi/svelte": patch
---

A `<T components>` config entry must now name a target, and its `props` accept an interface-typed
object like the other three bindings.

`ComponentMapping`'s object form left both `tag` and `component` optional, so
`{ link: { props: { href: "/" } } }` type-checked. It is not a config entry to the runtime:
`isTagComponentConfig` tests for `"tag" in value || "component" in value`, so the object was
forwarded as an opaque framework handler with its `props` dropped. On the client
`<svelte:boundary>` caught the resulting `TypeError`, reported it through
`i18n.reportError(error, { source: "translation", tagName })` and degraded the tag to bare
children. On the server there is no boundary, so reading `render(...).body` threw and the whole
render was lost. The object form is now a union requiring one of `tag`/`component`, matching
`@comvi/react`, `@comvi/solid` and `@comvi/vue`; 0.4.1 required `tag` outright.

`props` also widens from `Record<string, unknown>` to `Record<string, any>`, the value type the
other three already use: an INTERFACE-typed props object is not assignable to
`Record<string, unknown>` (only type-literal objects are), so a legitimate props value was being
rejected here alone.

Both are covered by a new `tests/types/components-map.test-d.ts`, and the server path now has a
vitest project of its own (`tests/ssr/`) that renders `<T>` through `svelte/server`.
