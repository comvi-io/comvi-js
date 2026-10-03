---
"@comvi/react": minor
---

**BREAKING (breaking change on a 0.x minor):** `@comvi/react` runs on a base `@comvi/core` host,
and the four loader/plugin members left `useI18n()` for two dedicated hooks.

| 0.4.x                                                                       | 0.5.0                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `const { addActiveNamespace, reloadTranslations, onLoadError } = useI18n()` | the same names, plus `addActiveNamespaces`, from `useI18nLoader()` |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()`                        |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; `useI18nLoader()` takes no argument     |

**Why the members moved.** `useI18n()` used to bind them eagerly, so the hook could not run
at all on a host without the loader/plugin capability, and its return type promised methods
that host does not have. They are acquired explicitly now, and a host that lacks the
capability fails at that one call with a message naming the fix — in development **and** in
production, never a silent no-op. The bag `useI18nLoader()` / `useI18nPlugins()` return is
referentially stable per host instance.

`<T>` ships as its own dist chunk with a `/*@__PURE__*/` memo wrapper, taking
`prepareTranslation` from the pure `@comvi/core/rich-text` seam, so an app that never
renders it drops the whole rich-text path and one that does never executes tag registration.
`I18nProviderProps.i18n` and both context value types accept `WrapperI18nHost` instead of
the concrete `I18n` class, so any composition of the base host fits. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md).
