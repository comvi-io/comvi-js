---
"@comvi/nuxt": minor
---

**BREAKING (0.x minor, WATCHDOG policy): the generated default host is the base host.**
`@comvi/nuxt` keeps every published entry, composable, component, middleware and server
utility. What changes is the build-time `#build/comvi.host` template when `hostModule` is
unset: it builds text + `{param}` interpolation, the cache, events and default params, and
NOTHING ELSE. ICU throws `E_ICU_SYNTAX` in development and renders literally in production;
the loader, plugin host and devtools discovery are absent until the app composes them;
string-API tag syntax is literal (dev-warned); nested inline catalogs need `flattenCatalog`.

`hostModule` is the composition escape and, for any app that loads translations
asynchronously, the migration path. (`icu: true` is the one exception — see
`nuxt-icu-option.md`.)

```ts
// nuxt.config.ts → comvi: { …, hostModule: "./comvi.host.ts" }
// comvi.host.ts — return a FRESH host per call
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).with(
    loader({ de: () => import("./locales/de.json") }),
  )) satisfies NuxtHostFactory;
```

Add `.with(plugins())` and `.with(devtools())` as the app needs them; their order among
themselves is free, and all three only have to be composed before `init()`. Constructor
catalogs select ICU with the `compiler` option, so `.with(icu())` is not Nuxt's recipe.

**The factory receives Nuxt's resolved host options** — `locale` (render locale on the
client, request locale on the server), `fallbackLocale`, `defaultNs`, `defaultParams`,
`tagInterpolation` from `basicHtmlTags`, `devMode` and `apiKey` — so spreading `options`
into `createI18n` preserves every existing configuration and request-locale contract. A
factory written earlier in 0.5.0 development that accepts no argument still works.
`NuxtHostFactory` / `NuxtHostFactoryOptions` are public types for it. The branch stays
build-time, and the factory is called once for the client plugin and once per
request-scoped server instance.

**Server host types now tell the truth.** `NuxtServerHost` is the base `WrapperI18nHost` the
server utilities accept; `NuxtServerLoaderHost` is that host plus `I18nLoaderApi`, the shape
SSR loading needs. Utilities narrow with `hasLoaderApi` before driving the loader, so a base
host with cached or setup-provided translations renders them, a base host with an empty
catalog warns once naming the `hostModule` + `.with(loader(map))` fix, and no path calls an
absent loader member.

`comvi.setup` still receives a `VueI18n`, and its removed capability proxies remain a
breaking migration: move them to `i18n.core.*`, composing that capability in the host
factory first. `const { reloadTranslations } = useI18n()` becomes `useI18nLoader()`, and
`onMissingKey` moves to `useI18nPlugins()`. Run
`pnpm codemod:framework-slim "app/**/*.{ts,vue}"`; Nuxt auto-imports and proxy calls in
`.vue` / `comvi.setup.*` are report-only, because the receiver type is textually
undecidable. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §7.
