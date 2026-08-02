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
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";

export default () => attachLoader(createI18n({ locale: "en" }));
```

The option is a module PATH, and the branch is taken at BUILD TIME: the module
generates `#build/comvi.host`, which imports the root `@comvi/core` entry only
when `hostModule` is unset. With it set, neither the runtime plugin nor the
server utilities name a root entry at all — that is the whole saving, and a
runtime `if` could not deliver it. Unset (the default) is unchanged.

Notes: the server always loads translations, so a server-rendered app's host
needs `attachLoader` (`NuxtServerHost = WrapperI18nHost & I18nLoaderApi`); the
factory is called once per constructed instance (client plugin, and each
per-request server instance); nuxt's resolved locale is applied to the host, so
routing/detection still win.

**BREAKING: `comvi.setup` hooks and `useI18n()`**

`i18n` in the app plugin is a `VueI18n`, and `VueI18n` dropped its seven
capability proxies — move those calls to `i18n.core.*`:

```diff
-export default ({ i18n }) => { i18n.registerLoader(myLoader); };
+export default ({ i18n }) => { i18n.core.registerLoader(myLoader); };
```

`useI18n()` loses `addActiveNamespace`, `reloadTranslations`, `onLoadError`
(→ `useI18nLoader()`) and `onMissingKey` (→ `useI18nPlugins()`). Both
composables are auto-imported, like `useI18n`. `NuxtI18nSetupContext<C>` /
`NuxtI18nSetup<C>` are now generic in the host type and default to the root
`I18n`, so a default-configuration app needs no annotation.

```
pnpm codemod:framework-slim "app/**/*.{ts,vue}"
```

**Troubleshooting**

| Symptom                                                                  | Cause / fix                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `i18n.registerLoader is not a function` in `comvi.setup`                 | use `i18n.core.registerLoader(…)`                                 |
| `addActiveNamespace is not a function` in a component                    | use `useI18nLoader()`                                             |
| `[comvi] missing loader capability — attach @comvi/core/loader` on SSR   | your `hostModule` host has no `attachLoader`; the server needs it |
| `comvi hostModule must export a default function returning an i18n host` | the module's default export is not a function                     |

**Measured** (`node scripts/size-check.mjs`, min+gz, comvi graph only; both
fixtures are the same runtime modules and differ only in the emitted
construction branch):

| fixture                                                   | min+gz    |
| --------------------------------------------------------- | --------- |
| `fw-nuxt-root` (default root branch)                      | **12445** |
| `fw-nuxt-server-slim-loader` (`hostModule`, server graph) | **10260** |
| `fw-nuxt-client-slim` (`hostModule`, client graph)        | **8887**  |

A nuxt server on a composed slim+loader host saves **2185 B min+gz (−17.6 %)**
of comvi graph; the client graph is 3558 B smaller than the root server graph.
