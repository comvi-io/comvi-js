---
"@comvi/vue": minor
---

**BREAKING — `@comvi/vue` runs on a bare `@comvi/core/slim` host.**

`VueI18n` no longer builds or demands a root core. It is now
`VueI18n<D, C extends WrapperI18nHost<D> = I18n<D>>` around an injected host it
exposes as `readonly core: C`, and the capability APIs live where the host
actually has them.

**New**

- `createI18nFromCore(core, options?)` — wrap a host you composed yourself
  (`@comvi/core/slim` + optional `attachLoader` / `attachPlugins`). The host's
  exact type is preserved as `i18n.core`.
- `useI18nLoader()` / `useI18nPlugins()` composables (`UseI18nLoaderReturn`,
  `UseI18nPluginsReturn`).
- `@comvi/vue/slim` — a root-free subpath entry: same classes, composables and
  `<T>`, minus `createI18n` and the `export * from "@comvi/core"` re-export.
  Use it when you build your own host; it is the only entry that keeps the root
  core out of a webpack **development** bundle too.
- `createI18n(options)` is unchanged and still the default: it builds the root
  core internally.

**Migration**

| Old (0.4.x)                                                                                                                                                                         | New (0.5.0)                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `const { reloadTranslations, addActiveNamespace, onLoadError } = useI18n()`                                                                                                         | `const { … } = useI18nLoader()`                                                                                                                                  |
| `const { onMissingKey } = useI18n()`                                                                                                                                                | `const { onMissingKey } = useI18nPlugins()`                                                                                                                      |
| `const { t, reloadTranslations } = useI18n("ns")`                                                                                                                                   | `const { t } = useI18n("ns"); const { reloadTranslations } = useI18nLoader();` — the namespace argument stays on `useI18n`, the capability composables take none |
| `i18n.registerLoader(…)` / `.reloadTranslations()` / `.onMissingKey(…)` / `.registerLocaleDetector(…)` / `.registerPostProcessor(…)` / `.onLoadError(…)` / `.addActiveNamespace(…)` | `i18n.core.registerLoader(…)` etc.                                                                                                                               |
| `i18n.use(plugin)` / `createI18n(options).use(plugin)`                                                                                                                              | `i18n.core.use(plugin)` — no longer chainable off the factory: assign first, then register on the host                                                           |
| `new VueI18n(options)`                                                                                                                                                              | `createI18n(options)` — the constructor now takes `(core, vueOptions)`                                                                                           |

`use` is the **eighth** dropped proxy and the one that changed late: it briefly
survived behind a capability guard, which made it the only member typed present
on every `C` that could still throw "missing capability" at runtime — precisely
the failure class this release exists to remove. It is gone from the class in
types and at runtime, in dev and in prod. Plugin composition belongs where the
instance is constructed, next to `registerLoader`.

Run the codemod for the destructuring shapes; instance-proxy call sites —
including `use` — are reported for manual `i18n.core.*` migration, because the
receiver's type is textually undecidable:

```
pnpm codemod:framework-slim "src/**/*.{ts,vue}"
```

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items
remain. Never rewritten, always reported (`path:line [shape] detail`, or
`--report report.json`): rest spreads, computed keys, hook results stored in a
variable, hook results crossing a function boundary, local-name collisions with
the introduced composables, `.vue` script blocks that fail extraction, and the
eight dropped instance proxies. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

**Troubleshooting**

| Symptom                                                                                | Cause / fix                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `X is not a function`, X ∈ {`addActiveNamespace`, `reloadTranslations`, `onLoadError`} | moved to `useI18nLoader()`                                      |
| `onMissingKey is not a function`                                                       | moved to `useI18nPlugins()`                                     |
| `[comvi] missing loader capability — attach @comvi/core/loader`                        | `useI18nLoader()` on a host composed without `attachLoader`     |
| `[comvi] missing plugins capability — attach @comvi/core/plugins`                      | `useI18nPlugins()` on a host composed without `attachPlugins`   |
| `i18n.core.reloadTranslations` does not compile inside a component                     | the inject path is host-typed by design — use `useI18nLoader()` |

**Also fixed (no app change needed)**

- `@comvi/vue` no longer inlines copies of core's tag + translate chunks into
  its own bundle (`vite.config.ts` externalizes `@comvi/core/slim` and
  `@comvi/core/tags`), and `<T>` is now its own dist chunk with a `/*@__PURE__*/`
  factory call. A vue app that never renders `<T>` no longer ships the tag
  machinery — and no longer runs core's ambient `registerTagSyntax()` from
  inside the vue bundle.

**Measured** (`node scripts/size-check.mjs`, min+gz, comvi graph only; `vue`
externalized, both columns from the same run):

| fixture                                         | before | after     |
| ----------------------------------------------- | ------ | --------- |
| `fw-vue-root` (root app, no `<T>`)              | 11930  | **10473** |
| `fw-vue-root-t` (root app with `<T>`)           | 11941  | **11498** |
| `fw-vue-slim` (bare slim via `@comvi/vue/slim`) | —      | **7525**  |
| `fw-vue-slim-t`                                 | —      | **9389**  |

Moving a vue app from `@comvi/core` to a bare `@comvi/core/slim` host saves
**2948 B min+gz (−28.1 %)** of comvi graph. A root vue app that never renders
`<T>` saves **1457 B** with no code change at all.
