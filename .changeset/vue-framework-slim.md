---
"@comvi/vue": minor
---

**BREAKING (breaking change on a 0.x minor) — `@comvi/vue` runs on a base `@comvi/core` host.**
`VueI18n` is now `VueI18n<D, C extends WrapperI18nHost<D> = I18n<D>>` around an injected
host it exposes as `readonly core: C`, and the capability APIs live where the host actually
has them.

**New:** `useI18nLoader()` / `useI18nPlugins()` composables (`UseI18nLoaderReturn`,
`UseI18nPluginsReturn`); and, as the escape hatch for a host built elsewhere,
`createI18nFromCore(core, options?)`, which wraps a host built with `createI18n` from
`@comvi/core` directly (`import { createI18n as createCore } from "@comvi/core"`) and preserves
its exact type as `i18n.core`. This package does not re-export core's constructor under a second
name — see `vue-drop-create-core.md`. `createI18n(options)` is unchanged and
still the default: it builds the host internally from the same options object, and
`.use(installer)` on its result composes capabilities onto that host.

| 0.4.x                                                                       | 0.5.0                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `const { reloadTranslations, addActiveNamespace, onLoadError } = useI18n()` | the same names from `useI18nLoader()`                                        |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()`                                  |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; the capability composables take no argument       |
| `i18n.registerLoader(…)` and the other six instance proxies                 | `i18n.core.registerLoader(…)` etc.                                           |
| `i18n.use(plugin)` / `createI18n(options).use(plugin)`                      | `i18n.core.registerPlugin(plugin)` — assign first, then register on the host |
| `new VueI18n(options)`                                                      | `createI18n(options)` — the constructor now takes `(core, vueOptions)`       |

Plugin registration is the **eighth** dropped proxy and the one that changed late: 0.4's
`use(plugin)` briefly survived behind a capability guard, which made it the only member typed
present on every `C` that could still throw "missing capability" at runtime — precisely the
failure class this release removes. It is gone from the class in types and at runtime, and it is
called `registerPlugin` on the host. The `use` the class carries now is the composition pipe,
which takes an installer.

```
pnpm codemod:framework-slim "src/**/*.{ts,vue}"
```

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items remain. Never
rewritten, always reported: rest spreads, computed keys, stored or boundary-crossing hook
results, local-name collisions, `.vue` script blocks that fail extraction, and the eight
dropped instance proxies — the receiver's type is textually undecidable, so they need manual
`i18n.core.*` migration.

**Also fixed (no app change needed).** `@comvi/vue` no longer inlines copies of core's tag
and translate chunks into its own bundle, and `<T>` is its own dist chunk with a
`/*@__PURE__*/` factory call — so a vue app that never renders `<T>` no longer ships the tag
machinery, and no vue bundle runs core's ambient `registerTagSyntax()` at all. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).
