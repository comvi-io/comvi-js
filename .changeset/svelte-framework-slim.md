---
"@comvi/svelte": minor
---

**BREAKING (0.x minor, WATCHDOG policy):** `@comvi/svelte` runs on a base `@comvi/core`
host, and the four loader/plugin members left `useI18n()` for two dedicated context readers.

This is the binding where the old contract did not merely mistype the host — it **crashed**
on one. `useI18n()` eagerly `.bind()`-ed all four in the object literal it returned, so on a
host without those capabilities it threw
`Cannot read properties of undefined (reading 'bind')` before a single translation rendered.

| 0.4.x                                                                       | 0.5.0                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `const { addActiveNamespace, reloadTranslations, onLoadError } = useI18n()` | the same names, plus `addActiveNamespaces`, from `useI18nLoader()` |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()`                        |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; `useI18nLoader()` takes no argument     |

```
pnpm codemod:framework-slim "src/**/*.{ts,js,svelte}"
```

It reads `.svelte` script blocks. Exit `0` = clean or fully transformed, `2` = rewrites
applied and manual items remain; it refuses — loudly, never silently — rest spreads,
computed keys, stored or boundary-crossing hook results, local-name collisions, script
blocks that fail extraction, and relative-import call sites it cannot retarget.

**They are readers, NOT stores.** `useI18nLoader()` / `useI18nPlugins()` call
`getI18nContext()`, so — like `useI18n()` — they are callable during component
initialisation only, and what they return is a plain object of bound functions. Do not
`$`-prefix a member. The asymmetry with `createLocaleStore()` & friends is deliberate: a
capability action is an imperative operation, not a value that changes over time. A host
that lacks the capability fails at the acquisition call with a message naming the fix, in
development **and** in production.

**Fixed: the published package was unimportable from webpack and Node ESM.** `dist/*.js`
re-exported its siblings with extensionless specifiers, which strict-ESM resolvers reject
for a `"type": "module"` package. The source now carries the emitted `.js` extension; no
public API changed.

`setI18nContext(i18n)`, `getI18nContext()` and all six store factories accept
`WrapperI18nHost` instead of the concrete `I18n` class, and the store factories gained an
optional `D` type parameter (inferred) because `WrapperI18nHost<D>` is invariant in `D`. See
the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).
