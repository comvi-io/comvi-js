---
"@comvi/solid": minor
---

**BREAKING (0.x minor, WATCHDOG policy):** `@comvi/solid` runs on a base `@comvi/core` host,
and the four loader/plugin members left `useI18n()` for two dedicated accessors — the same
contract as `@comvi/react`.

| 0.4.x                                                                       | 0.5.0                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `const { addActiveNamespace, reloadTranslations, onLoadError } = useI18n()` | the same names, plus `addActiveNamespaces`, from `useI18nLoader()` |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()`                        |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; `useI18nLoader()` takes no argument     |

```
pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"
```

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items remain (each
printed as `path:line [shape] detail`; `--report report.json` writes the same list as JSON).
It refuses — loudly, never silently — rest spreads, computed keys, hook results stored in a
variable or crossing a function boundary, local-name collisions, and relative-import call
sites it cannot retarget.

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
`I18nProviderProps.i18n`, `useI18nContext()`'s return and all six reactive primitives accept
`WrapperI18nHost` instead of the concrete `I18n` class. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).
