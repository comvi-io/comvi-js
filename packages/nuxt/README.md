<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/nuxt</h1>

<p align="center">Nuxt 3 / 4 module for Comvi i18n — auto-imports, SSR, and locale routing.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/nuxt"><img src="https://img.shields.io/npm/v/@comvi/nuxt?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/nuxt"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/nuxt?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/nuxt` is a Nuxt module: add it to `modules` and `useI18n()`, `<T>` and
`<NuxtLinkLocale>` are auto-imported, with SSR and locale-prefixed routes handled for you. App code
imports nothing.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are auto-imported by nothing. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`. In a nuxt app you
build it in one file, `comvi.host.ts`, and the module constructs it once per runtime — plus once per
server request.

📖 [Documentation](https://comvi.io/docs/i18n/nuxt/) ·
⚖️ [Comvi vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n/)

## 1. Install

```bash
npm install @comvi/nuxt
# Peer: nuxt ^3.0.0 || ^4.0.0
```

## 2. Quick start — an inline catalog

Two files plus one call. `nuxt.config.ts` configures the locales, the routing and the inline
catalog, `app.vue` makes the one call the module will not make for you, and a page reads
`useI18n()`. There is no host file yet — step 3 adds it.

Runnable version: [`examples/nuxt`](../../examples/nuxt), which opens in
[StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/nuxt) straight from the repository — see
[examples/README.md](../../examples/README.md) for the link pattern.

```ts title="nuxt.config.ts"
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: [
      { code: "en", name: "English", iso: "en-US" },
      { code: "uk", name: "Українська", iso: "uk-UA" },
    ],
    defaultLocale: "en",
    localePrefix: "as-needed",
    translation: {
      en: { greeting: "Hello, {name}!" },
      uk: { greeting: "Привіт, {name}!" },
    },
  },
});
```

```vue title="app.vue"
<script setup lang="ts">
// The ONE call the module will not make for you. Nothing in @comvi/nuxt touches
// <html>, so `lang` and `dir` stay unset until this runs — a page that renders
// perfectly and ships <html> with no `lang` is the symptom. `addDir` derives the
// direction from the locale, so adding an RTL locale to nuxt.config.ts gives you
// dir="rtl" with no further change.
useLocaleHead({ addLang: true, addDir: true });
</script>

<template>
  <NuxtPage />
</template>
```

```vue title="pages/index.vue"
<script setup lang="ts">
const { t, locale } = useI18n(); // auto-imported
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
  <NuxtLinkLocale to="/" :locale="locale === 'en' ? 'uk' : 'en'">Switch</NuxtLinkLocale>
</template>
```

With no `comvi.host.*` file the module builds the **base host** for you: text and `{param}`
interpolation, the translation cache, events and default params — no ICU compiler, no loader, no
plugin host, no devtools discovery. Nothing is injected on your behalf, so nothing you did not ask
for is in your bundle. A nested `translation` object is flattened by the base host, so
`{ nav: { home: "Home" } }` resolves `t("nav.home")` with nothing composed.

## 3. Connect to Comvi

One file, and it is the one place that decides what your app loads and compiles:
**`comvi.host.ts`**. Two additions:

1. **`compiler: icuCompiler`.** The platform's catalogs use ICU plurals. Without the compiler an ICU
   message throws in development and renders literally in production. `compiler` is a constructor
   argument rather than something `.use()` can pipe on, so it goes into the options object.
2. **`.use(cdnLoader({ cdnUrl }))`** from `@comvi/plugin-fetch-loader/cdn`, which fetches the
   catalog at runtime instead of bundling it.

The module's route middleware pre-loads the current locale before the page renders, and the server
hydrates the client with what it loaded — so there is no first-paint gate to write here.

```bash
npm install @comvi/plugin-fetch-loader
```

```ts title="comvi.host.ts" check=group=nuxt-app
import { createI18n, icuCompiler, type NuxtHostFactory } from "@comvi/nuxt/host";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).use(
    cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
  )) satisfies NuxtHostFactory;
```

`t("items", { count: 5 })` now renders a locale-correct plural from
`"{count, plural, one {# item} other {# items}}"`, and `setLocale()` loads and switches
asynchronously.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and read it off the
**Distributions** page.

**Every value comes from `@comvi/nuxt/host`.** That subpath re-exports core's composition surface, so
`comvi.host.ts` resolves from `npm install @comvi/nuxt` alone: `@comvi/core` is a dependency of this
package rather than of your app, so naming `@comvi/core/icu` directly would need your app to declare
`@comvi/core` too.

**The factory must return a fresh host every call.** It runs once per constructed instance: the app
plugin, and each per-request server instance. See
[Server-side rendering](#5-server-side-rendering).

## 4. Nuxt API reference

### `comvi.host.ts` and the `hostModule` option

The module looks for `./comvi.host.*` under `srcDir`, then `rootDir`, logs the path it picked, and
warns about a near miss (a `comvi.host.cjs` it found but could not resolve). `hostModule` names the
file explicitly; it is a module **path**, not a function, and a set `hostModule` that does not
resolve fails the build rather than falling back.

```ts title="nuxt.config.ts"
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./i18n/host.ts" },
});
```

Either way the branch is taken at **build time**: the module generates `#build/comvi.host`, and with
a host module neither the runtime plugin nor the server utilities go through nuxt's own construction
path. A runtime `if` could not deliver that, because it would keep both paths alive in every bundle.

The default export must be a core **host**, not a `VueI18n`. The guard requires `t()` AND `init()`
and rejects the wrapper's own `core` member; its `TypeError` names `createI18n` from
`@comvi/nuxt/host`.

The factory receives nuxt's **resolved options**: `locale` (the render locale on the client, the
request locale on the server), `fallbackLocale`, `defaultNs`, `defaultParams`, `translation`,
`tagInterpolation` from `basicHtmlTags`, `devMode` and `apiKey`. Spreading them keeps `nuxt.config`
in charge of configuration while you stay in charge of capabilities. `apiKey` is forwarded to the
host as `i18n.apiKey`, where a loader plugin such as
[`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) reads it — on its own it loads nothing, and
this module has no CDN or API option that does.

One option reaches only one of the two calls: the app plugin runs in both bundles and adds
`ssrLocale`, so a server render and the hydrated client agree on the render locale, while the
request-scoped Nitro host has no hydration to match and omits it. Set it inside the factory if a
server route needs it.

### What goes in the host file

Each capability is one import and one `.use(...)`. `.use(installer)` is core's composition pipe:
`i18n.use(f)` is `f(i18n)`, nothing more.

| you want                                                  | you add                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ICU plurals / select / selectordinal                      | `compiler: icuCompiler`, in the options object                                                                                              |
| SSR + async translation loading                           | `.use(loader(importMap))`                                                                                                                   |
| plugins, locale detectors, missing-key hooks              | `.use(plugins())`                                                                                                                           |
| your own inline plugin, in one call                       | `.use(definePlugin(fn))`                                                                                                                    |
| browser-extension discovery                               | `.use(devtools())`                                                                                                                          |
| `<tag>` syntax in plain string-API `t()`                  | `import "@comvi/core/tags"` once, anywhere in the app                                                                                       |
| a first-party plugin: CDN loader, locale detector, editor | `.use(cdnLoader({ … }))` / `.use(localeDetector())` / `.use(inContextEditor())`; each installer composes the capabilities that plugin needs |

Everything in the right column but the ambient tag import comes from **`@comvi/nuxt/host`**, which
re-exports `createI18n`, `icuCompiler`, `loader`, `attachLoader`, `plugins`, `devtools`,
`definePlugin` and the `NuxtHostFactory` type. `flattenCatalog` is deliberately not on the subpath:
the base host flattens a nested catalog itself, in `comvi.translation` and in a loader result alike.

```ts title="comvi.host.ts"
// Everything at once.
import {
  createI18n,
  icuCompiler,
  loader,
  plugins,
  devtools,
  type NuxtHostFactory,
} from "@comvi/nuxt/host";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })
    .use(loader({ uk: () => import("./locales/uk.json") }))
    .use(plugins())
    .use(devtools())) satisfies NuxtHostFactory;
```

Order does not matter: every capability composed before `init()` is attached by the time plugins
run, and ICU is an option rather than a composition step. The import map is **required**, which is
the whole rule: `loader(map)` attaches the capability **and** registers the map, while a plain
`LoaderFn` goes to `.use(attachLoader)` followed by `registerLoader(fn)`.

ICU is the one capability with a module option: `icu: true` in `nuxt.config.ts` reaches the host
through its options. With no host module it lands on the generated base host; with one,
`compiler: icuCompiler` is the LAST key in the options your factory receives, so
`createI18n({ ...options })` compiles ICU and `createI18n({ ...options, compiler: mine })` keeps
yours.

So `comvi.host.ts` is the one file in a nuxt app that names comvi values. `useI18n()`,
`useI18nLoader()`, `useI18nPlugins()`, `<T>` and `<NuxtLinkLocale>` are auto-imported, so app code
names none; a typed `comvi.setup.ts` and a `TranslationKeys` augmentation name types only. Reading
that one file tells you exactly what your app pays for.

### Composables

`useI18n()` returns the translation bag every host can serve — `t`, `tRaw`, `locale`, `setLocale`,
`isLoading`, `isInitializing`, `isInitialized`, `cacheRevision` — plus the four `Intl` formatters,
as Vue refs. It is [`@comvi/vue`](../vue#usei18n)'s composable, auto-imported, so that README is the
reference for it. `useI18n("admin")` binds the namespace at the type level.

`useLocaleHead`, `useLocalePath` and `useSwitchLocalePath` are the routing composables, also
auto-imported.

### `useI18nLoader()` and `useI18nPlugins()`

Async loading and the plugin host are **capabilities**: things the host has only once your
`comvi.host.ts` composes them. Both are auto-imported, like `useI18n`.

```vue
<script setup lang="ts">
const { t } = useI18n("admin");
const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
  useI18nLoader();
const { onMissingKey } = useI18nPlugins();
</script>
```

They verify the capability once, at the acquisition call, and throw in development and production
alike when the host has none — so a component that asks for something the app never composed fails
loudly there rather than doing nothing.

### `comvi.setup.ts` hooks

A setup hook gets the host directly as `core`, the same object on both runtimes. Write the hook with
**no** host type and the module supplies it, read off your factory:

```ts check=group=nuxt-app
// comvi.setup.ts — the types are on the module's root, so this file, like
// comvi.host.ts, needs no dependency your app did not declare. It shares a
// fence group with the `comvi.host.ts` above BECAUSE the loader capability this
// file calls is composed there: the snippet gate pools the two the same way
// codegen does, so neither one alone can vouch for the call below.
import type { LoaderFn, NuxtI18nSetup } from "@comvi/nuxt";

const myLoader: LoaderFn = async (locale, namespace) =>
  (await fetch(`/i18n/${locale}/${namespace}.json`)).json();

export default (({ core }) => {
  core.registerLoader(myLoader);
}) satisfies NuxtI18nSetup;
```

That line compiles BECAUSE your `comvi.host.ts` composed a loader. At build time the module
generates `.nuxt/types/comvi-host.ts`, which declares the host as
`ReturnType<typeof import("./comvi.host").default>` and publishes it through the
`ComviNuxtHostRegistry` interface — so `NuxtI18nSetup`'s default type argument is the host your
factory actually returns, not a claim about it. Drop the loader from `comvi.host.ts` and
`nuxi typecheck` fails on the `registerLoader` line, where it used to throw a `TypeError` on the
first call.

`NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` stay generic for a host whose type the module cannot
see — a factory in another package, a `.js` `comvi.host`, or a hook shared by several apps. Naming it
by hand is the fallback, and codegen cross-checks the claim rather than trusting it: the generated
file puts your hook through `CheckedNuxtI18nSetup<TheRealHost, YourHook>`, so
`NuxtI18nSetup<I18n & I18nLoaderApi>` against a factory that composed no loader is a build error
naming both sides.

```diff check=skip:proxy-relocation
-export default ({ i18n }) => { i18n.registerLoader(myLoader); };
+export default ({ core }) => { core.registerLoader(myLoader); };
```

### Locale routing

The module creates locale-prefixed routes from your existing pages: configure `locales`,
`defaultLocale` and `localePrefix` (`'always'` / `'as-needed'` / `'never'`) and it clones the pages
into localized paths. The middleware detects the language from the URL path, cookies, or the
server-side `Accept-Language` header, and persists the choice in a cookie.

```vue
<template>
  <nav>
    <NuxtLinkLocale to="/" :locale="'en'">English</NuxtLinkLocale>
    <NuxtLinkLocale to="/" :locale="'uk'">Українська</NuxtLinkLocale>
  </nav>
</template>
```

### Rich text with `<T>`

`<T>` is inherited from [`@comvi/vue`](../vue#rich-text-with-t), auto-imported, with the same shape:
named slots, or a `components` map. Embed components inside a translation without raw HTML and
without splitting the sentence across template fragments.

```vue
<template>
  <T i18nKey="help">
    <template #link="{ children }">
      <a href="/docs">{{ children }}</a>
    </template>
  </T>
</template>
```

## 5. Server-side rendering

Nuxt **forbids** a module-scope host on the server, and the module enforces that for you: your
factory is called once per per-request server instance, so it must return a fresh host every call.
This is the opposite of the rule `@comvi/next` follows — the four frameworks' rules are side by side
in [docs/design/ssr.md](../../docs/design/ssr.md), and the cross-framework guide on the site is at
[comvi.io/docs/i18n/guides/ssr/](https://comvi.io/docs/i18n/guides/ssr/).

SSR loading is the loader capability at work, so a server-rendered app composes a loader in
`comvi.host.ts` as step 3 does. Without one, the server utilities say so once, by name, and render
whatever the catalog already holds. They never call a member the host does not have.

The module loads translations on the server and hydrates the client with the pre-loaded messages, so
there is no flash of untranslated content.

## 6. Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key, and
targets `@comvi/core`, which your app declares. One augmentation serves every binding, generated by
[`@comvi/cli`](../cli) from the platform or [`@comvi/vite-plugin`](../vite-plugin) from local JSON.
The declaration, the examples and what TypeScript catches are in the
[root README](https://github.com/comvi-io/comvi-js#typed-translation-keys).

## 7. What it weighs

Measured min+gz through the published runtime subpaths, with `vue`, `#app`, `#build` and `h3`
externalized, and gated in [`scripts/size-budgets.json`](../../scripts/size-budgets.json) at the
recorded baseline + 5 %. Each row is gated on its emitted module graph as well as its bytes.

| graph                                                     | measured as              | min+gz  |
| --------------------------------------------------------- | ------------------------ | ------- |
| client: runtime plugin + `useI18n()` on the base host     | `fw-nuxt-client-default` | 8440 B  |
| a `comvi.host.ts` through the `@comvi/nuxt/host` subpath  | `fw-nuxt-host`           | 8004 B  |
| every capability composed: ICU, loader, plugins, devtools | `fw-nuxt-full-composite` | 12099 B |

The client row is what a nuxt app with no host file builds. The last row is the most an upgrade can
cost — a 0.4 app that composes everything back — rather than a like-for-like comparison: 0.4 also
registered string-API tag syntax ambiently, which is now the separate `import "@comvi/core/tags"`.

Beyond `h3` and `@nuxt/kit`, which every Nuxt app already has, there are no runtime dependencies. No
`eval` or `new Function` anywhere, so it runs under a strict CSP without `unsafe-eval`.

## 8. Where to go next

- **The Vue composables and `<T>` in full:** [`@comvi/vue`](../vue)
- **Loading from the platform:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) for API mode,
  namespace layout and offline fallbacks.
- **Design notes:** [composition](../../docs/design/composition.md) ·
  [ICU](../../docs/design/icu.md) · [rich text](../../docs/design/rich-text.md) ·
  [formatting](../../docs/design/formatting.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **Upgrading from 0.4.x:** `comvi.host.ts` is where every capability is chosen, and that is the
  whole of 0.5's change to this module. See
  [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md), whose §2 tables the
  hook renames and whose §6 covers this module; Nuxt auto-imports and the dropped `comvi.setup`
  proxies are edited by hand.
- **Full API:** [comvi.io/docs/i18n/nuxt/](https://comvi.io/docs/i18n/nuxt/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
