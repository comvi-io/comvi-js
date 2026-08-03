---
"@comvi/nuxt": minor
---

**BREAKING — composed-host support (`hostModule`) + the `comvi.setup` proxy migration.**

**New: `hostModule`**

```ts
// nuxt.config.ts
comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./comvi.host.ts" }
```

```ts
// comvi.host.ts — default-export a factory returning a FRESH host per call
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";

export default () => attachLoader(createI18n({ locale: "en" }));
```

The option is a module PATH, and the branch is taken at BUILD TIME: the module
generates `#build/comvi.host`, which imports `@comvi/core` directly only when
`hostModule` is unset. With it set, neither the runtime plugin nor the server
utilities name a core entry at all — that is the whole saving, and a runtime
`if` could not deliver it. Unset (the default) is unchanged.

Notes: the server always loads translations, so a server-rendered app's host
needs `attachLoader` (`NuxtServerHost = WrapperI18nHost & I18nLoaderApi`); the
factory is called once per constructed instance (client plugin, and each
per-request server instance); nuxt's resolved locale is applied to the host, so
routing/detection still win.

**BREAKING: `comvi.setup` hooks and `useI18n()`**

`i18n` in the app plugin is a `VueI18n`, and `VueI18n` dropped its eight
capability proxies — move those calls to `i18n.core.*`:

```diff
-export default ({ i18n }) => { i18n.registerLoader(myLoader); };
+export default ({ i18n }) => { i18n.core.registerLoader(myLoader); };

-export default ({ i18n }) => { i18n.use(FetchLoader({ … })); };
+export default ({ i18n }) => { i18n.core.use(FetchLoader({ … })); };
```

`NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` are now generic in the host type
and default to core's `I18n`, so a default-configuration app needs no
annotation.

**Migration**

| Old (0.4.x)                                                                 | New (0.5.0)                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `const { addActiveNamespace, reloadTranslations, onLoadError } = useI18n()` | `const { addActiveNamespace, addActiveNamespaces, reloadTranslations, onLoadError } = useI18nLoader()` — auto-imported, like `useI18n`                                                                                                                       |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()` — auto-imported                                                                                                                                                                                                  |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `const { t } = useI18n("ns"); const { reloadTranslations } = useI18nLoader();` — the namespace argument stays on `useI18n`, the capability composables take none                                                                                             |
| `comvi.setup` hook calling a dropped `VueI18n` proxy                        | `i18n.core.registerLoader(…)`, `i18n.core.use(…)`, `i18n.core.registerLocaleDetector(…)`, `i18n.core.registerPostProcessor(…)`, `i18n.core.onLoadError(…)`, `i18n.core.onMissingKey(…)`, `i18n.core.addActiveNamespace(…)`, `i18n.core.reloadTranslations()` |
| server host built without `attachLoader` under `hostModule`                 | compose `attachLoader(createI18n(…))` — `NuxtServerHost = WrapperI18nHost & I18nLoaderApi`                                                                                                                                                                   |

```
pnpm codemod:framework-slim "app/**/*.{ts,vue}"
```

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items
remain. The codemod rewrites the destructure shapes and reports — never
rewrites — the shapes whose receiver type it cannot decide: rest spreads,
computed keys, hook results stored in a variable or crossing a function
boundary, local-name collisions with the introduced composables, script blocks
that fail extraction, and every dropped-proxy call in a `.vue` file or a
`comvi.setup.*` module. Nuxt auto-imports are reported as `manual-import`
rather than guessed. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

**Troubleshooting**

| Symptom                                                                  | Cause / fix                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `i18n.registerLoader is not a function` in `comvi.setup`                 | use `i18n.core.registerLoader(…)`                                 |
| `i18n.use is not a function` in `comvi.setup`                            | use `i18n.core.use(…)`                                            |
| `addActiveNamespace is not a function` in a component                    | use `useI18nLoader()`                                             |
| `onMissingKey is not a function` in a component                          | use `useI18nPlugins()`                                            |
| `[comvi] missing loader capability — attach @comvi/core/loader` on SSR   | your `hostModule` host has no `attachLoader`; the server needs it |
| `comvi hostModule must export a default function returning an i18n host` | the module's default export is not a function                     |

**Measured** (`node scripts/size-check.mjs`, min+gz, comvi graph only; both
fixtures are the same runtime modules and differ only in the emitted
construction branch):

| fixture                                                   | min+gz    |
| --------------------------------------------------------- | --------- |
| `fw-nuxt-root` (default root branch)                      | **12254** |
| `fw-nuxt-server-slim-loader` (`hostModule`, server graph) | **10044** |
| `fw-nuxt-client-slim` (`hostModule`, client graph)        | **8661**  |

A nuxt server on a composed slim+loader host saves **2210 B min+gz (−18.0 %)**
of comvi graph; the client graph is 3593 B smaller than the root server graph.

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
