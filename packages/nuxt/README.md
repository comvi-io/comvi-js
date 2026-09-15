<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/nuxt</h1>

<p align="center">Nuxt module for Comvi i18n — auto-imports, SSR, and locale-prefixed routes.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/nuxt"><img src="https://img.shields.io/npm/v/@comvi/nuxt?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/nuxt"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/nuxt?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/nuxt` is a Nuxt module: add it to `modules` and `useI18n()`, `<T>` and
`<NuxtLinkLocale>` are auto-imported, with SSR and locale-prefixed routes handled for you. App code
imports nothing. Pair it with the [Comvi platform](https://comvi.io) and the catalogs are fetched
from the CDN at runtime instead of bundled.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are auto-imported by nothing. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`. In a nuxt app you
build it in one file, `comvi.host.ts`, and the module constructs it once per runtime — plus once per
server request.

📖 [Documentation](https://comvi.io/docs/i18n/nuxt) · ⚖️ [Comvi vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n)

## 1. Install

```bash
npm install @comvi/nuxt
# Peer: nuxt ^3.0.0 || ^4.0.0
```

## 2. Quick start — an inline catalog

Two files plus one call. `nuxt.config.ts` configures the locales, the routing and the inline
catalog, `app.vue` makes the one call the module will not make for you, and a page reads
`useI18n()`. There is no host file yet — step 3 adds it. Runnable:
[`examples/nuxt`](../../examples/nuxt).

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
**`comvi.host.ts`**. Three questions, and the third needs no line here at all.

1. **Which parser?** `compiler: icuCompiler`. The platform's catalogs use ICU plurals, and the
   default `{param}` compiler does not render them. Without `compiler: icuCompiler`, an ICU message
   (`{count, plural, …}`) fails in development at ingestion, before anything renders. Inline, it
   throws `E_ICU_SYNTAX` at the call that carries the catalog; over a loader it fails that
   namespace's load instead — `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and
   `init()` rejects with `[i18n] Failed to load all namespaces …`, not with `E_ICU_SYNTAX`, when
   that was the only namespace. In production it renders the message text literally and reports the
   error through `onError` (`console.error` when no handler is set).
2. **Where from?** `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn` (a second
   install), which fetches the catalog at runtime instead of bundling it.
3. **What to paint meanwhile?** Nothing, on this module. Its route middleware pre-loads the
   current locale before the page renders, and the server hydrates the client with what it loaded,
   so there is no gate to write.

`compiler` is a constructor argument rather than something `.use()` can pipe on, so it goes
into the options object.

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

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and copy it from
**Settings → Content Deploy → CDN Endpoint** (the URL is generated when Content Deploy is enabled and saved).

**The factory must return a fresh host every call.** It runs once per constructed instance: the app
plugin, and each per-request server instance ([SSR](https://comvi.io/docs/i18n/ssr)).

## 4. What is specific to Nuxt

The module looks for `./comvi.host.*` under `srcDir`, then `rootDir`, and logs the path it picked.
The `hostModule` option names the file explicitly; it is a module **path**, not a function, and a
set `hostModule` that does not resolve fails the build rather than falling back.

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

**Every value but the ambient tag import comes from `@comvi/nuxt/host`**, which re-exports
`createI18n`, `icuCompiler`, `loader`, `attachLoader`, `plugins`, `devtools`, `definePlugin` and the
`NuxtHostFactory` type — so `comvi.host.ts` resolves from `npm install @comvi/nuxt` alone.

`useI18n()`, `useI18nLoader()`, `useI18nPlugins()`, `useLocaleHead()`, `useLocalePath()` and
`useSwitchLocalePath()` are all auto-imported; `useI18n()` is `@comvi/vue`'s composable, returning
Vue refs, and `<T>` is inherited from there with the same named-slot shape.

## 5. Where to go next

- **This binding:** [guide](https://comvi.io/docs/i18n/nuxt) ·
  [module options](https://comvi.io/docs/i18n/api/nuxt) ·
  [composables](https://comvi.io/docs/i18n/api/nuxt-composables)
- **Guides:** [plurals & ICU](https://comvi.io/docs/i18n/pluralization) ·
  [typed keys](https://comvi.io/docs/i18n/type-safety) · [SSR](https://comvi.io/docs/i18n/ssr) ·
  [errors](https://comvi.io/docs/i18n/errors) · [limitations](https://comvi.io/docs/i18n/limitations)
- **Also here:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) · [`@comvi/vue`](../vue) ·
  [`docs/design/`](../../docs/design)
- **Upgrading from 0.4.x:** the host moved into `comvi.host.ts` and `comvi.cdnUrl` / `comvi.apiBaseUrl`
  are gone. [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) and
  [upgrade to 0.5](https://comvi.io/docs/i18n/guides/upgrade-to-v05/nuxt) cover it row by row.

Beyond `h3` and `@nuxt/kit`, which every Nuxt app already has, there are no runtime dependencies,
and no `eval` or `new Function` anywhere. Measured min+gz with `vue`, `#app`, `#build` and `h3`
externalized, gated in CI; every fixture and the 0.4.1 comparison:
[bundle size](https://comvi.io/docs/i18n/bundle-size).

| graph                                                 | measured as              | min+gz |
| ----------------------------------------------------- | ------------------------ | ------ |
| client: runtime plugin + `useI18n()` on the base host | `fw-nuxt-client-default` | 8440 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
