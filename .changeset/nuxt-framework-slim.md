---
"@comvi/nuxt": minor
---

**BREAKING (breaking change on a 0.x minor): the generated default instance is the base instance.**
`@comvi/nuxt` keeps every published entry, composable, component, middleware and server
utility. What changes is the build-time `#build/comvi.i18n` template when `i18nModule` is
unset: it builds text + `{param}` interpolation, the cache, events and default params, and
NOTHING ELSE. ICU throws `E_ICU_SYNTAX` in development and renders literally in production;
the loader, plugins capability and devtools discovery are absent until the app composes them; and
string-API tag syntax is literal (dev-warned). A nested inline catalog is NOT on that list:
the base instance flattens one itself, so `comvi.messages` works nested or flat.

`i18nModule` is the composition escape and, for any app that loads translations
asynchronously, the migration path. (`icu: true` is the one exception — see
`nuxt-icu-option.md`.)

```ts
// nuxt.config.ts → comvi: { …, i18nModule: "./comvi.i18n.ts" }
// comvi.i18n.ts — return a FRESH instance per call
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import type { NuxtInstanceFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).use(
    loader({ de: () => import("./locales/de.json") }),
  )) satisfies NuxtInstanceFactory;
```

Add `.use(plugins())` and `.use(devtools())` as the app needs them; their order among
themselves is free, and all three only have to be composed before `init()`. ICU is not
composed: it is the `compiler` option, and it covers every catalog source.

**The factory receives Nuxt's resolved instance options** — `locale` (render locale on the
client, request locale on the server), `fallbackLocale`, `defaultNs`, `defaultParams`,
`tagInterpolation` from `basicHtmlTags`, `devMode` and `apiKey` — so spreading `options`
into `createI18n` preserves every existing configuration and request-locale contract. A
factory written earlier in 0.5.0 development that accepts no argument still works.
`NuxtInstanceFactory` / `NuxtInstanceFactoryOptions` are public types for it. The branch stays
build-time, and the factory is called once for the client plugin and once per
request-scoped server instance.

**Server instance types now tell the truth.** `NuxtServerInstance` is the base `WrapperI18nInstance` the
server utilities accept; `NuxtServerLoaderInstance` is that instance plus `I18nLoaderApi`, the shape
SSR loading needs. Utilities narrow with `hasLoaderApi` before driving the loader, so a base
instance with cached or setup-provided translations renders them, a base instance with an empty
catalog warns once naming the `i18nModule` + `.use(loader(map))` fix, and no path calls an
absent loader member.

`comvi.setup` still receives a `VueI18n`, and its removed capability proxies remain a
breaking migration: move them to `i18n.core.*`, composing that capability in the instance
factory first. `const { reloadMessages } = useI18n()` becomes `useI18nLoader()`, and
`onMissingKey` moves to `useI18nPlugins()`. The proxy calls in `.vue` / `comvi.setup.*` files
are the ones to read carefully: `i18n.reloadMessages()` may be a `VueI18n` proxy that moves
to `i18n.core.*` or an already-correct raw core instance, and only you can tell which. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §6.
