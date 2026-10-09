---
"@comvi/solid": minor
---

**BREAKING (breaking change on a 0.x minor):** `@comvi/solid` runs on a base `@comvi/core` host,
and the four loader/plugin members left `useI18n()` for two dedicated accessors — the same
contract as `@comvi/react`.

| 0.4.x                                                                   | 0.5.0                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `const { addActiveNamespace, reloadMessages, onLoadError } = useI18n()` | the same names, plus `addActiveNamespaces`, from `useI18nLoader()` |
| `const { onMissingKey } = useI18n()`                                    | `const { onMissingKey } = useI18nPlugins()`                        |
| `const { t, reloadMessages } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; `useI18nLoader()` takes no argument     |

**Why the members moved.** `useI18n()` used to close over them, so its return type promised
methods a base host does not have and calling one produced a bare
`undefined is not a function` at an arbitrary call site. They are acquired explicitly now,
and a host that lacks the capability fails at that one call with a message naming the fix,
in development **and** in production.

`useI18nLoader()` / `useI18nPlugins()` are plain accessors — **no signals**: a capability
action is an imperative operation, not a reactive value. The bag they return is
referentially stable per host instance. `<T>` ships as its own dist chunk taking
`prepareTranslation` from the pure `@comvi/core/rich-text` seam, so an app that never
renders it drops the whole rich-text path and one that does never executes tag registration.
`I18nProviderProps.i18n`, `useI18nInstance()`'s return and all nine reactive primitives accept
`WrapperI18nInstance` instead of the concrete `I18n` class — the seven read-only `create*Signal`
accessors plus the two `create*State` pairs, `createDefaultNamespaceState` and
`createDefaultParamsState`, whose setters write through to the host. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md).
