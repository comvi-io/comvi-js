---
"@comvi/nuxt": minor
---

**BREAKING (0.x minor, WATCHDOG policy): the generated default host is the base
host.** `nuxt-single-entry-convergence.md` in this same release leads with what a
0.4 Nuxt app experiences; this entry is the recipe and the migration table.

`@comvi/nuxt` keeps every published entry, composable, component, middleware and
server utility. What changes is the build-time `#build/comvi.host` template when
`hostModule` is unset: it now builds text + `{param}` interpolation, the cache,
events and default params, and NOTHING ELSE.

- ICU syntax under the simple compiler throws `E_ICU_SYNTAX` in development and
  production.
- The loader, plugin host and devtools discovery are absent until the app
  composes them.
- String-API tag syntax is literal in production (dev-warned); `<T>` keeps its
  pure per-call rich-text grammar.
- Nested inline catalogs need `flattenCatalog`; the loader flattens at ingestion.

There is no compiler auto-injection or Nuxt-specific capability sugar.
`hostModule` is the explicit composition escape and, for any app that loads
translations asynchronously, the migration path.

```ts
// nuxt.config.ts
comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./comvi.host.ts" }
```

```ts
// comvi.host.ts — return a FRESH host per call
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })
    .with(loader({ de: () => import("./locales/de.json") }))
    .with(plugins())
    .with(devtools())) satisfies NuxtHostFactory;
```

Drop the lines the app does not use. The order of `loader()`, `plugins()` and
`devtools()` among themselves is free — all three only have to be composed
before `init()`. Inline / constructor catalogs select
ICU with the `compiler` option shown above; `.with(icu())` is only for an empty
host before its first ingestion, so it is not Nuxt's catalog-bearing recipe.

The branch remains build-time. With `hostModule` configured, the emitted module
imports the user factory and `createI18nFromCore`; it does not retain Nuxt's own
construction path behind a runtime `if`. The factory is called once for the
client plugin and once per request-scoped server instance.

**New: the factory receives Nuxt's resolved host options.** It is called with
`locale` (render locale on the client, request locale on the server),
`fallbackLocale`, `defaultNs`, `defaultParams`, `tagInterpolation` from
`basicHtmlTags`, `devMode` and `apiKey`. Spreading `options` into `createI18n`
preserves every existing Nuxt configuration and request-locale contract. A
factory written earlier in the 0.5.0 development train that accepts no argument
still works.

**Server host types now tell the truth.** `NuxtServerHost` is the base
`WrapperI18nHost` server utilities accept; `NuxtServerLoaderHost` is that host
plus `I18nLoaderApi`, the shape SSR loading needs. Server utilities narrow with
`hasLoaderApi` before driving the loader:

- a base host with cached / setup-provided translations renders them;
- a base host with an empty catalog warns once, naming the `hostModule` +
  `.with(loader(map))` fix, and returns no payload;
- a loader-capable host with no registered loader keeps the separate
  `comvi.setup` registration warning;
- no path calls an absent loader member or introduces a browser global at
  import time.

`NuxtHostFactory` / `NuxtHostFactoryOptions` are public types for the factory,
and the existing `NuxtI18nSetup<C>` generic carries the same composed host type
into `comvi.setup`.

`comvi.setup` still receives a `VueI18n` in the app plugin. Its removed
capability proxies remain a breaking migration: move them to `i18n.core.*`, and
compose that capability in the host factory first.

| 0.4 usage                                  | 0.5.0 migration                                         |
| ------------------------------------------ | ------------------------------------------------------- |
| ICU catalog                                | `compiler: icuCompiler` in `comvi.host.ts`              |
| SSR / async translations                   | `.with(loader(importMap))`                              |
| `comvi.setup` calls `i18n.use(...)`        | `.with(plugins())`, then `i18n.core.use(...)`           |
| browser-extension visibility               | `.with(devtools())`                                     |
| `const { reloadTranslations } = useI18n()` | `const { reloadTranslations } = useI18nLoader()`        |
| `const { onMissingKey } = useI18n()`       | `const { onMissingKey } = useI18nPlugins()`             |
| dropped `VueI18n` proxy in `comvi.setup`   | call the same member on `i18n.core`                     |
| nested inline catalog                      | `flattenCatalog`, or ingest through `.with(loader())`   |
| string-API `<tag>` syntax                  | `<T>`, or import the explicit ambient tags subpath once |

```sh
pnpm codemod:framework-slim "app/**/*.{ts,vue}"
```

Exit `0` means clean or fully transformed; `2` means rewrites were applied and
manual items remain. Nuxt auto-imports are report-only (`manual-import`), and
proxy calls in `.vue` / `comvi.setup.*` remain report-only because the receiver
type is textually undecidable.

**Size fixtures were converged, without inheriting incomparable numbers:**

- `fw-nuxt-client-default` — generated default client host; six absent
  sentinels (ICU, loader, plugins, devtools and the ambient tag pair);
- `fw-nuxt-server-default-loader` — server graph with exactly the loader;
  five absent sentinels;
- `fw-nuxt-full-composite` — ICU + loader + plugins + devtools; ambient tag pair
  still absent.

The three rows gate their sentinels immediately, and the 0.5.0 measurement sweep
filled their min+gzip baselines and measured +2% budgets: `fw-nuxt-client-default`
**8108 B**, `fw-nuxt-server-default-loader` **10017 B** and
`fw-nuxt-full-composite` **11648 B** min+gz, as recorded in
`scripts/size-budgets.json`. No saving against the 0.4 host is
claimed: the generated default host and the 0.4 batteries-included one are not
comparable row for row, so there is no before column to subtract.
