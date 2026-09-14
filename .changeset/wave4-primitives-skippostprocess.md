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

**`<T raw>` is renamed to `<T skipPostProcess>`, in all four bindings.** `raw` meant two unrelated
things — `tRaw()` returns the structured result; `<T raw>` skips post-processors, notably the
in-context editor's invisible markers — and only the `<T>` prop is renamed; `tRaw` is untouched.
`raw` keeps working as a deprecated alias, removed in 0.6, with a one-time development warning
(`<T raw>` is deprecated. Use `<T skipPostProcess>` instead); setting both props lets
`skipPostProcess` win. Rename the prop wherever you render `<T>` — JSX and `.vue` / `.svelte`
template markup alike.
