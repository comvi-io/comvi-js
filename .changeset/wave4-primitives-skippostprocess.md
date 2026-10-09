---
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/vue": minor
"@comvi/next": patch
"@comvi/nuxt": patch
---

**Solid and svelte each gain the one per-axis primitive they were missing.** Solid shipped
`createDefaultNamespaceSignal` with no default-params counterpart; svelte shipped
`createDefaultParamsStore` with no default-namespace counterpart. Both sets now cover the same
axes: solid gains `createDefaultParamsSignal(i18n)` and svelte gains
`createDefaultNamespaceStore(i18n)` — the latter a writable store, memoized per instance like its
siblings, where assigning into it (`store.set(ns)`) writes through to `i18n.setDefaultNamespace`.

Both axes are also WRITABLE in both, each in its framework's own shape, so neither set is the
read-only one. **Solid's primitives now follow one naming rule: `create*Signal` READS —
an `Accessor` mirroring the host, on all seven axes — and `create*State` READS AND WRITES,
returning `[accessor, setter]`.** So `createDefaultParamsSignal(i18n)` returns
`Accessor<DefaultParamsSnapshot<D>>`, and the tuple lives on the two `State` primitives:
`createDefaultParamsState(i18n)` (setter → `i18n.setDefaultParams`) and
`createDefaultNamespaceState(i18n)` (setter → `i18n.setDefaultNamespace`). Svelte keeps stores as
its write path, so `createDefaultNamespaceStore` and `createDefaultParamsStore` are both
`Writable`, their `set` / `update` calling the host. Every setter writes THROUGH to the host,
which stays the source of truth; nothing assigns a local value. React and vue are unaffected.

**BREAKING (breaking change on a 0.x minor): `<T raw>` is renamed to `<T markers={false}>`, in
all four bindings, with the polarity inverted.** `raw` meant two unrelated things — `tRaw()`
returns the structured result; `<T raw>` kept the in-context editor's invisible markers out of
the output — and only the `<T>` prop is renamed; `tRaw` is untouched. The new name says the one
thing it does: `markers={false}` leaves this result unmarked, and nothing else reads it. Replace
`<T raw>` with `<T markers={false}>` wherever you render `<T>` — JSX and `.vue` (`:markers="false"`)
/ `.svelte` template markup alike.
