---
"@comvi/vue": minor
---

**BREAKING (0.x minor, WATCHDOG policy) — `@comvi/vue` runs on a base `@comvi/core` host.**

`VueI18n` no longer builds or demands a batteries-included core. It is now
`VueI18n<D, C extends WrapperI18nHost<D> = I18n<D>>` around an injected host it
exposes as `readonly core: C`, and the capability APIs live where the host
actually has them.

**New**

- `createI18nFromCore(core, options?)` — wrap a host you composed yourself
  (`@comvi/core` + optional `attachLoader` / `attachPlugins`). The host's
  exact type is preserved as `i18n.core`.
- `useI18nLoader()` / `useI18nPlugins()` composables (`UseI18nLoaderReturn`,
  `UseI18nPluginsReturn`).
- `createCore(options)` — `@comvi/core`'s own constructor, re-exported by name
  because vue's `createI18n` is a real preset and already owns that name. It is
  the composed path's starting point, and it ships from the same entry.
- `createI18n(options)` is unchanged and still the default: it builds the host
  internally from the same options object.

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
  its own bundle (`vite.config.ts` externalizes every `@comvi/core` specifier),
  and `<T>` is now its own dist chunk with a `/*@__PURE__*/` factory call. A vue
  app that never renders `<T>` no longer ships the tag machinery — and no vue
  bundle runs core's ambient `registerTagSyntax()` any more, because the
  convergence moved `<T>` onto the pure `@comvi/core/rich-text` seam and no
  module in the package names the ambient entry at all.

**Measured** (`node scripts/size-check.mjs`, min+gz, comvi graph only; `vue`
externalized, both columns from the same run):

| app shape                             | before | after     |
| ------------------------------------- | ------ | --------- |
| vue + 0.4 composed root, no `<T>`     | 11930  | **10473** |
| vue + 0.4 composed root, with `<T>`   | 11941  | **11498** |
| vue + base host, injected, no `<T>`   | —      | **7525**  |
| vue + base host, injected, with `<T>` | —      | **9389**  |

At that checkpoint, moving a vue app off the 0.4 composed root onto a base
`@comvi/core` host saved **2948 B min+gz (−28.1 %)** of comvi graph, and a
composed-root vue app that never rendered `<T>` saved **1457 B** with no code
change at all.

Those four numbers were measured at the framework-slim P4 commit, when the base
host lived on a core subpath the app named directly and the wrapper still had
two entries. The vue convergence then collapsed both specifiers and moved
`<T>`'s shared `prepareTranslation` import off the ambient `@comvi/core/tags`
entry onto the pure `@comvi/core/rich-text` seam, so those graphs no longer
exist and the row names above are historical. The live ladder is
`fw-vue-default`, `fw-vue-default-composed` (informational), `fw-vue-default-t`,
`fw-vue-icu` and `fw-vue-full-composite`; each gated row is sentinel-gated from
the first run and carries a measured +2% budget from the 0.5.0 re-baseline
sweep, over measurements of 6966, 8812, 7848 and 11435 B min+gz.
`fw-vue-default-composed` is informational and gates nothing. `vue-default` absorbed the old `vue-on-slim` case and `vue-composed`
retargeted the old `vue-slim-preset` one.

> Rewritten in place at the single-entry convergence and at the vue convergence
> that followed it (same release), which is why the file name still says `slim`:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host — so every specifier above
> names the root, and every "the root has it already" claim reads against the
> base host. Vue then converged the same way: it publishes its root and nothing
> beside it, and the star-free subpath this entry announced is gone, its whole
> surface merged into the root it was created to escape. The 0.4 composed root
> survives only as a recipe (`.with(loader())`, `.with(plugins())`,
> `.with(devtools())`, `compiler: icuCompiler` from `@comvi/core/icu`,
> `import "@comvi/core/tags"`); see `core-single-entry-convergence.md` and
> `vue-single-entry-convergence.md` for the breaks and the migrations.
