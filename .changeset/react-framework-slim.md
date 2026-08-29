---
"@comvi/react": minor
---

**BREAKING (0.x minor, WATCHDOG policy):** `@comvi/react` runs on a base `@comvi/core` host,
and the four loader/plugin members left `useI18n()` for two dedicated hooks.

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
It refuses — loudly, never silently — rest spreads, computed keys, stored hook results and
local-name collisions.

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
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).
